use std::{collections::HashSet, time::Instant};

use futures_util::TryStreamExt;
use regex::Regex;
use serde_json::{Map, Value};
use sqlx::{
    mysql::{MySql, MySqlPool},
    postgres::{PgPool, Postgres},
    sqlite::{Sqlite, SqlitePool},
    Column, QueryBuilder, Row,
};
use tauri::State;

use crate::{
    domains::query::{
        models::{DatabaseValue, QueryRequest, QueryResult, UpdateCellRequest, UpdateCellResult},
        values,
    },
    domains::schema::service::introspect,
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

#[tauri::command]
pub async fn update_cell(
    request: UpdateCellRequest,
    state: State<'_, AppState>,
) -> Result<UpdateCellResult, String> {
    let connection = state
        .connections
        .read()
        .await
        .get(&request.connection_id)
        .cloned()
        .ok_or("Connection not found.")?;
    update(&connection, &request).await
}

pub async fn update(
    connection: &StoredConnection,
    request: &UpdateCellRequest,
) -> Result<UpdateCellResult, String> {
    if connection.read_only {
        return Err(
            "This connection is read-only. Reconnect in editable mode to change data.".into(),
        );
    }
    if request.primary_keys.is_empty() {
        return Err("A primary key is required to edit a row safely.".into());
    }
    if request.column.is_empty() || request.table.is_empty() || request.schema.is_empty() {
        return Err("The update target is incomplete.".into());
    }

    let schema = introspect(&connection.pool, &connection.name, &connection.kind).await?;
    let table = schema
        .tables
        .iter()
        .find(|table| table.schema == request.schema && table.name == request.table)
        .ok_or("The table no longer exists. Refresh the schema and try again.")?;
    if table.kind != "table" {
        return Err("Views cannot be edited from the data browser.".into());
    }
    let target = table
        .columns
        .iter()
        .find(|column| column.name == request.column)
        .ok_or("The column no longer exists. Refresh the schema and try again.")?;
    if target.primary_key {
        return Err("Primary-key values are locked in the data browser.".into());
    }
    if request.value.is_null() && !target.nullable {
        return Err(format!("{} does not allow NULL values.", target.name));
    }

    let expected_keys = table
        .columns
        .iter()
        .filter(|column| column.primary_key)
        .map(|column| column.name.as_str())
        .collect::<HashSet<_>>();
    let requested_keys = request
        .primary_keys
        .iter()
        .map(|key| key.column.as_str())
        .collect::<HashSet<_>>();
    if expected_keys.is_empty()
        || expected_keys != requested_keys
        || request.primary_keys.len() != expected_keys.len()
    {
        return Err("The row selector does not match the table's primary key.".into());
    }

    let mut normalized = request.clone();
    normalized.data_type.clone_from(&target.data_type);
    for key in &mut normalized.primary_keys {
        let column = table
            .columns
            .iter()
            .find(|column| column.name == key.column)
            .ok_or("A primary-key column no longer exists.")?;
        key.data_type.clone_from(&column.data_type);
    }

    let affected_rows = match &connection.pool {
        DatabasePool::Sqlite(pool) => update_sqlite(pool, &normalized).await?,
        DatabasePool::Postgres(pool) => update_postgres(pool, &normalized).await?,
        DatabasePool::MySql(pool) => update_mysql(pool, &normalized).await?,
    };
    if affected_rows > 1 {
        return Err("The update matched more than one row and was rejected.".into());
    }
    Ok(UpdateCellResult { affected_rows })
}

async fn update_sqlite(pool: &SqlitePool, request: &UpdateCellRequest) -> Result<u64, String> {
    let mut query = QueryBuilder::<Sqlite>::new(format!(
        "UPDATE {}.{} SET {} = ",
        quote_identifier(&request.schema, '"'),
        quote_identifier(&request.table, '"'),
        quote_identifier(&request.column, '"')
    ));
    push_sqlite_value(&mut query, &request.value);
    push_sqlite_keys(&mut query, &request.primary_keys);
    query
        .build()
        .execute(pool)
        .await
        .map(|done| done.rows_affected())
        .map_err(clean_error)
}

async fn update_postgres(pool: &PgPool, request: &UpdateCellRequest) -> Result<u64, String> {
    let mut query = QueryBuilder::<Postgres>::new(format!(
        "UPDATE {}.{} SET {} = ",
        quote_identifier(&request.schema, '"'),
        quote_identifier(&request.table, '"'),
        quote_identifier(&request.column, '"')
    ));
    push_postgres_value(&mut query, &request.value, &request.data_type);
    push_postgres_keys(&mut query, &request.primary_keys);
    query
        .build()
        .execute(pool)
        .await
        .map(|done| done.rows_affected())
        .map_err(clean_error)
}

async fn update_mysql(pool: &MySqlPool, request: &UpdateCellRequest) -> Result<u64, String> {
    let mut query = QueryBuilder::<MySql>::new(format!(
        "UPDATE {}.{} SET {} = ",
        quote_identifier(&request.schema, '`'),
        quote_identifier(&request.table, '`'),
        quote_identifier(&request.column, '`')
    ));
    push_mysql_value(&mut query, &request.value);
    push_mysql_keys(&mut query, &request.primary_keys);
    query
        .build()
        .execute(pool)
        .await
        .map(|done| done.rows_affected())
        .map_err(clean_error)
}

fn push_sqlite_keys(query: &mut QueryBuilder<'_, Sqlite>, keys: &[DatabaseValue]) {
    query.push(" WHERE ");
    for (index, key) in keys.iter().enumerate() {
        if index > 0 {
            query.push(" AND ");
        }
        query.push(quote_identifier(&key.column, '"'));
        if key.value.is_null() {
            query.push(" IS NULL");
        } else {
            query.push(" = ");
            push_sqlite_value(query, &key.value);
        }
    }
}

fn push_postgres_keys(query: &mut QueryBuilder<'_, Postgres>, keys: &[DatabaseValue]) {
    query.push(" WHERE ");
    for (index, key) in keys.iter().enumerate() {
        if index > 0 {
            query.push(" AND ");
        }
        query.push(quote_identifier(&key.column, '"'));
        if key.value.is_null() {
            query.push(" IS NULL");
        } else {
            query.push(" = ");
            push_postgres_value(query, &key.value, &key.data_type);
        }
    }
}

fn push_mysql_keys(query: &mut QueryBuilder<'_, MySql>, keys: &[DatabaseValue]) {
    query.push(" WHERE ");
    for (index, key) in keys.iter().enumerate() {
        if index > 0 {
            query.push(" AND ");
        }
        query.push(quote_identifier(&key.column, '`'));
        if key.value.is_null() {
            query.push(" IS NULL");
        } else {
            query.push(" = ");
            push_mysql_value(query, &key.value);
        }
    }
}

fn push_sqlite_value(query: &mut QueryBuilder<'_, Sqlite>, value: &Value) {
    match value {
        Value::Null => {
            query.push("NULL");
        }
        Value::Bool(value) => {
            query.push_bind(*value);
        }
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                query.push_bind(value);
            } else {
                query.push_bind(value.as_f64().unwrap_or_default());
            }
        }
        Value::String(value) => {
            query.push_bind(value.clone());
        }
        Value::Array(_) | Value::Object(_) => {
            query.push_bind(value.to_string());
        }
    }
}

fn push_postgres_value(query: &mut QueryBuilder<'_, Postgres>, value: &Value, data_type: &str) {
    match value {
        Value::Null => {
            query.push("NULL");
        }
        Value::Bool(value) => {
            query.push_bind(*value);
        }
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                query.push_bind(value);
            } else {
                query.push_bind(value.as_f64().unwrap_or_default());
            }
        }
        Value::String(value) => {
            query.push_bind(value.clone());
            if let Some(cast) = postgres_cast(data_type) {
                query.push("::").push(cast);
            }
        }
        Value::Array(_) | Value::Object(_) => {
            query.push_bind(sqlx::types::Json(value.clone()));
        }
    }
}

fn push_mysql_value(query: &mut QueryBuilder<'_, MySql>, value: &Value) {
    match value {
        Value::Null => {
            query.push("NULL");
        }
        Value::Bool(value) => {
            query.push_bind(*value);
        }
        Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                query.push_bind(value);
            } else if let Some(value) = value.as_u64() {
                query.push_bind(value);
            } else {
                query.push_bind(value.as_f64().unwrap_or_default());
            }
        }
        Value::String(value) => {
            query.push_bind(value.clone());
        }
        Value::Array(_) | Value::Object(_) => {
            query.push_bind(value.to_string());
        }
    }
}

fn postgres_cast(data_type: &str) -> Option<&'static str> {
    match data_type.trim().to_ascii_lowercase().as_str() {
        "uuid" => Some("uuid"),
        "date" => Some("date"),
        "time" | "time without time zone" => Some("time"),
        "time with time zone" | "timetz" => Some("timetz"),
        "timestamp" | "timestamp without time zone" => Some("timestamp"),
        "timestamp with time zone" | "timestamptz" => Some("timestamptz"),
        "smallint" | "int2" => Some("int2"),
        "integer" | "int" | "int4" => Some("int4"),
        "bigint" | "int8" => Some("int8"),
        "numeric" | "decimal" => Some("numeric"),
        "real" | "float4" => Some("float4"),
        "double precision" | "float8" => Some("float8"),
        "boolean" | "bool" => Some("bool"),
        "json" => Some("json"),
        "jsonb" => Some("jsonb"),
        _ => None,
    }
}

fn quote_identifier(identifier: &str, quote: char) -> String {
    let escaped = identifier.replace(quote, &format!("{quote}{quote}"));
    format!("{quote}{escaped}{quote}")
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
