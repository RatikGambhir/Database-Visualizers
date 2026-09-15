use std::time::Instant;

use futures_util::TryStreamExt;
use regex::Regex;
use serde_json::{Map, Value};
use sqlx::{mysql::MySqlPool, postgres::PgPool, sqlite::SqlitePool, Column, Row};
use tauri::State;

use crate::{
    domains::query::{
        models::{QueryRequest, QueryResult},
        values,
    },
    infrastructure::database::{clean_error, DatabasePool, StoredConnection},
    AppState,
};

#[tauri::command]
pub async fn execute_query(
    request: QueryRequest,
    state: State<'_, AppState>,
) -> Result<QueryResult, String> {
    let connection = state
        .connections
        .read()
        .await
        .get(&request.connection_id)
        .cloned()
        .ok_or("Connection not found.")?;
    run(&connection, &request.sql, request.limit).await
}

pub async fn run(
    connection: &StoredConnection,
    sql: &str,
    limit: usize,
) -> Result<QueryResult, String> {
    let sql = sql.trim();
    if sql.is_empty() {
        return Err("Enter a SQL statement to run.".into());
    }
    if connection.read_only && contains_write_statement(sql) {
        return Err(
            "This connection is read-only. Reconnect in editable mode to run mutations.".into(),
        );
    }
    let limit = limit.clamp(1, 5_000);
    match &connection.pool {
        DatabasePool::Sqlite(pool) => query_sqlite(pool, sql, limit).await,
        DatabasePool::Postgres(pool) => query_postgres(pool, sql, limit).await,
        DatabasePool::MySql(pool) => query_mysql(pool, sql, limit).await,
    }
}

async fn query_sqlite(pool: &SqlitePool, sql: &str, limit: usize) -> Result<QueryResult, String> {
    if !returns_rows(sql) {
        let started = Instant::now();
        let done = sqlx::query(sql).execute(pool).await.map_err(clean_error)?;
        return Ok(mutation_result(done.rows_affected(), started));
    }
    let started = Instant::now();
    let mut stream = sqlx::query(sql).fetch(pool);
    let mut rows = Vec::new();
    let mut columns = Vec::new();
    while let Some(row) = stream.try_next().await.map_err(clean_error)? {
        if columns.is_empty() {
            columns = row
                .columns()
                .iter()
                .map(|column| column.name().to_string())
                .collect();
        }
        rows.push(values::sqlite_row(&row));
        if rows.len() > limit {
            break;
        }
    }
    Ok(rows_result(columns, rows, started, limit))
}

async fn query_postgres(pool: &PgPool, sql: &str, limit: usize) -> Result<QueryResult, String> {
    if !returns_rows(sql) {
        let started = Instant::now();
        let done = sqlx::query(sql).execute(pool).await.map_err(clean_error)?;
        return Ok(mutation_result(done.rows_affected(), started));
    }
    let started = Instant::now();
    let mut stream = sqlx::query(sql).fetch(pool);
    let mut rows = Vec::new();
    let mut columns = Vec::new();
    while let Some(row) = stream.try_next().await.map_err(clean_error)? {
        if columns.is_empty() {
            columns = row
                .columns()
                .iter()
                .map(|column| column.name().to_string())
                .collect();
        }
        rows.push(values::postgres_row(&row));
        if rows.len() > limit {
            break;
        }
    }
    Ok(rows_result(columns, rows, started, limit))
}

async fn query_mysql(pool: &MySqlPool, sql: &str, limit: usize) -> Result<QueryResult, String> {
    if !returns_rows(sql) {
        let started = Instant::now();
        let done = sqlx::query(sql).execute(pool).await.map_err(clean_error)?;
        return Ok(mutation_result(done.rows_affected(), started));
    }
    let started = Instant::now();
    let mut stream = sqlx::query(sql).fetch(pool);
    let mut rows = Vec::new();
    let mut columns = Vec::new();
    while let Some(row) = stream.try_next().await.map_err(clean_error)? {
        if columns.is_empty() {
            columns = row
                .columns()
                .iter()
                .map(|column| column.name().to_string())
                .collect();
        }
        rows.push(values::mysql_row(&row));
        if rows.len() > limit {
            break;
        }
    }
    Ok(rows_result(columns, rows, started, limit))
}

fn rows_result(
    columns: Vec<String>,
    mut rows: Vec<Map<String, Value>>,
    started: Instant,
    limit: usize,
) -> QueryResult {
    let truncated = rows.len() > limit;
    if truncated {
        rows.pop();
    }
    let count = rows.len();
    QueryResult {
        columns,
        rows,
        affected_rows: 0,
        duration_ms: started.elapsed().as_secs_f64() * 1_000.0,
        truncated,
        message: if truncated {
            format!("Showing first {count} rows")
        } else {
            format!("{count} row{} returned", if count == 1 { "" } else { "s" })
        },
    }
}

fn mutation_result(affected_rows: u64, started: Instant) -> QueryResult {
    QueryResult {
        columns: vec![],
        rows: vec![],
        affected_rows,
        duration_ms: started.elapsed().as_secs_f64() * 1_000.0,
        truncated: false,
        message: format!(
            "{affected_rows} row{} affected",
            if affected_rows == 1 { "" } else { "s" }
        ),
    }
}

pub(crate) fn returns_rows(sql: &str) -> bool {
    let first = sql
        .trim_start()
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(
        first.as_str(),
        "SELECT" | "WITH" | "SHOW" | "DESCRIBE" | "DESC" | "EXPLAIN" | "PRAGMA" | "VALUES"
    )
}

pub(crate) fn contains_write_statement(sql: &str) -> bool {
    Regex::new(r"(?i)\b(insert|update|delete|alter|drop|truncate|create|replace|grant|revoke|vacuum|attach|detach)\b").expect("valid regex").is_match(sql)
}

#[cfg(test)]
mod tests {
    use super::{contains_write_statement, returns_rows};

    #[test]
    fn classifies_row_returning_statements() {
        for sql in [
            "SELECT 1",
            " with rows as (select 1) select * from rows",
            "PRAGMA table_info(users)",
            "EXPLAIN SELECT 1",
        ] {
            assert!(returns_rows(sql), "{sql}");
        }
        for sql in ["UPDATE users SET active = 1", "CREATE TABLE x(id INT)"] {
            assert!(!returns_rows(sql), "{sql}");
        }
    }

    #[test]
    fn catches_writes_inside_common_table_expressions() {
        assert!(contains_write_statement(
            "WITH changed AS (DELETE FROM sessions RETURNING *) SELECT * FROM changed"
        ));
        assert!(!contains_write_statement("SELECT 'updated' AS label"));
    }
}
