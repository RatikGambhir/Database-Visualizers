use chrono::Utc;
use sqlx::{
    mysql::MySqlPool,
    postgres::PgPool,
    sqlite::{SqlitePool, SqlitePoolOptions},
    Row,
};
use tauri::State;
use uuid::Uuid;

use crate::{
    domains::{
        connection::models::{ConnectResult, ConnectionProfile},
        schema::{
            ddl,
            models::{ColumnSchema, DatabaseSchema, ForeignKeySchema, TableSchema},
        },
    },
    infrastructure::database::{clean_error, DatabasePool, StoredConnection},
    AppState,
};

#[tauri::command]
pub async fn get_schema(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<DatabaseSchema, String> {
    let connection = state
        .connections
        .read()
        .await
        .get(&connection_id)
        .cloned()
        .ok_or("Connection not found.")?;
    introspect(&connection.pool, &connection.name, &connection.kind).await
}

#[tauri::command]
pub async fn import_sql_file(
    path: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<ConnectResult, String> {
    import_file(&path, &name, &state).await
}

pub async fn import_file(
    path: &str,
    name: &str,
    state: &AppState,
) -> Result<ConnectResult, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|error| format!("Could not read SQL file: {error}"))?;
    if content.trim().is_empty() {
        return Err("The SQL file is empty.".into());
    }
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .map_err(clean_error)?;
    if sqlx::raw_sql(&content).execute(&pool).await.is_ok() {
        let id = Uuid::new_v4().to_string();
        let db_pool = DatabasePool::Sqlite(pool);
        let schema = introspect(&db_pool, name, "sql-file").await?;
        state.connections.write().await.insert(
            id.clone(),
            StoredConnection {
                pool: db_pool,
                name: name.into(),
                kind: "sql-file".into(),
                read_only: false,
            },
        );
        return Ok(ConnectResult {
            connection: ConnectionProfile {
                id,
                name: name.into(),
                kind: "sql-file".into(),
                detail: path.into(),
                connected: true,
                read_only: false,
            },
            schema,
        });
    }
    let tables = ddl::parse_schema(&content)?;
    if tables.is_empty() {
        return Err("No CREATE TABLE or CREATE VIEW statements were found.".into());
    }
    Ok(ConnectResult {
        connection: ConnectionProfile {
            id: format!("sql-{}", Uuid::new_v4()),
            name: name.into(),
            kind: "sql-file".into(),
            detail: path.into(),
            connected: false,
            read_only: true,
        },
        schema: DatabaseSchema {
            name: name.into(),
            dialect: "sql-file".into(),
            tables,
            loaded_at: Utc::now().to_rfc3339(),
        },
    })
}

pub async fn introspect(
    pool: &DatabasePool,
    name: &str,
    dialect: &str,
) -> Result<DatabaseSchema, String> {
    let tables = match pool {
        DatabasePool::Sqlite(pool) => introspect_sqlite(pool).await?,
        DatabasePool::Postgres(pool) => introspect_postgres(pool).await?,
        DatabasePool::MySql(pool) => introspect_mysql(pool).await?,
    };
    Ok(DatabaseSchema {
        name: name.into(),
        dialect: dialect.into(),
        tables,
        loaded_at: Utc::now().to_rfc3339(),
    })
}

async fn introspect_sqlite(pool: &SqlitePool) -> Result<Vec<TableSchema>, String> {
    let objects: Vec<(String, String)> = sqlx::query_as("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name").fetch_all(pool).await.map_err(clean_error)?;
    let mut tables = Vec::with_capacity(objects.len());
    for (name, kind) in objects {
        let identifier = name.replace('"', "\"\"");
        let column_rows = sqlx::query(&format!("PRAGMA table_info(\"{identifier}\")"))
            .fetch_all(pool)
            .await
            .map_err(clean_error)?;
        let columns = column_rows
            .into_iter()
            .map(|row| ColumnSchema {
                name: row.try_get("name").unwrap_or_default(),
                data_type: row
                    .try_get::<String, _>("type")
                    .unwrap_or_else(|_| "unknown".into()),
                nullable: row.try_get::<i64, _>("notnull").unwrap_or(0) == 0,
                primary_key: row.try_get::<i64, _>("pk").unwrap_or(0) > 0,
                default_value: row.try_get("dflt_value").ok(),
            })
            .collect();
        let foreign_rows = sqlx::query(&format!("PRAGMA foreign_key_list(\"{identifier}\")"))
            .fetch_all(pool)
            .await
            .map_err(clean_error)?;
        let foreign_keys = foreign_rows
            .into_iter()
            .map(|row| ForeignKeySchema {
                name: format!("fk_{name}_{}", row.try_get::<i64, _>("id").unwrap_or(0)),
                from_column: row.try_get("from").unwrap_or_default(),
                to_schema: Some("main".into()),
                to_table: row.try_get("table").unwrap_or_default(),
                to_column: row.try_get("to").unwrap_or_default(),
            })
            .collect();
        tables.push(TableSchema {
            schema: "main".into(),
            name,
            kind,
            row_count: None,
            columns,
            foreign_keys,
        });
    }
    Ok(tables)
}

async fn introspect_postgres(pool: &PgPool) -> Result<Vec<TableSchema>, String> {
    let objects: Vec<(String, String, String)> = sqlx::query_as("SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name").fetch_all(pool).await.map_err(clean_error)?;
    let mut tables = Vec::with_capacity(objects.len());
    for (schema, name, table_type) in objects {
        let column_rows = sqlx::query("SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, EXISTS (SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = c.table_schema AND tc.table_name = c.table_name AND kcu.column_name = c.column_name) AS is_primary FROM information_schema.columns c WHERE c.table_schema = $1 AND c.table_name = $2 ORDER BY c.ordinal_position").bind(&schema).bind(&name).fetch_all(pool).await.map_err(clean_error)?;
        let columns = column_rows
            .into_iter()
            .map(|row| ColumnSchema {
                name: row.try_get("column_name").unwrap_or_default(),
                data_type: row
                    .try_get("data_type")
                    .unwrap_or_else(|_| "unknown".into()),
                nullable: row.try_get::<String, _>("is_nullable").unwrap_or_default() == "YES",
                primary_key: row.try_get("is_primary").unwrap_or(false),
                default_value: row.try_get("column_default").ok(),
            })
            .collect();
        let foreign_rows = sqlx::query("SELECT tc.constraint_name, kcu.column_name, ccu.table_schema AS foreign_schema, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2").bind(&schema).bind(&name).fetch_all(pool).await.map_err(clean_error)?;
        let foreign_keys = foreign_rows
            .into_iter()
            .map(|row| ForeignKeySchema {
                name: row.try_get("constraint_name").unwrap_or_default(),
                from_column: row.try_get("column_name").unwrap_or_default(),
                to_schema: row.try_get("foreign_schema").ok(),
                to_table: row.try_get("foreign_table").unwrap_or_default(),
                to_column: row.try_get("foreign_column").unwrap_or_default(),
            })
            .collect();
        tables.push(TableSchema {
            schema,
            name,
            kind: if table_type == "VIEW" {
                "view".into()
            } else {
                "table".into()
            },
            row_count: None,
            columns,
            foreign_keys,
        });
    }
    Ok(tables)
}

async fn introspect_mysql(pool: &MySqlPool) -> Result<Vec<TableSchema>, String> {
    let objects: Vec<(String, String, String)> = sqlx::query_as("SELECT table_schema, table_name, table_type FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name").fetch_all(pool).await.map_err(clean_error)?;
    let mut tables = Vec::with_capacity(objects.len());
    for (schema, name, table_type) in objects {
        let column_rows = sqlx::query("SELECT column_name, column_type, is_nullable, column_default, column_key FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position").bind(&schema).bind(&name).fetch_all(pool).await.map_err(clean_error)?;
        let columns = column_rows
            .into_iter()
            .map(|row| ColumnSchema {
                name: row.try_get("column_name").unwrap_or_default(),
                data_type: row
                    .try_get("column_type")
                    .unwrap_or_else(|_| "unknown".into()),
                nullable: row.try_get::<String, _>("is_nullable").unwrap_or_default() == "YES",
                primary_key: row.try_get::<String, _>("column_key").unwrap_or_default() == "PRI",
                default_value: row.try_get("column_default").ok(),
            })
            .collect();
        let foreign_rows = sqlx::query("SELECT constraint_name, column_name, referenced_table_schema, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL").bind(&schema).bind(&name).fetch_all(pool).await.map_err(clean_error)?;
        let foreign_keys = foreign_rows
            .into_iter()
            .map(|row| ForeignKeySchema {
                name: row.try_get("constraint_name").unwrap_or_default(),
                from_column: row.try_get("column_name").unwrap_or_default(),
                to_schema: row.try_get("referenced_table_schema").ok(),
                to_table: row.try_get("referenced_table_name").unwrap_or_default(),
                to_column: row.try_get("referenced_column_name").unwrap_or_default(),
            })
            .collect();
        tables.push(TableSchema {
            schema,
            name,
            kind: if table_type == "VIEW" {
                "view".into()
            } else {
                "table".into()
            },
            row_count: None,
            columns,
            foreign_keys,
        });
    }
    Ok(tables)
}

#[cfg(test)]
mod tests {
    use super::introspect;
    use crate::infrastructure::database::DatabasePool;
    use sqlx::sqlite::SqlitePoolOptions;

    #[tokio::test]
    async fn introspects_sqlite_columns_and_foreign_keys() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql("PRAGMA foreign_keys = ON; CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT NOT NULL); CREATE TABLE posts(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT);").execute(&pool).await.unwrap();
        let schema = introspect(&DatabasePool::Sqlite(pool), "test", "sqlite")
            .await
            .unwrap();
        assert_eq!(schema.tables.len(), 2);
        let posts = schema
            .tables
            .iter()
            .find(|table| table.name == "posts")
            .unwrap();
        assert_eq!(posts.columns.len(), 3);
        assert_eq!(posts.foreign_keys[0].to_table, "users");
    }
}
