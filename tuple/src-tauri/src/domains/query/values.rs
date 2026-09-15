use base64::Engine;
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use serde::Serialize;
use serde_json::{json, Map, Value};
use sqlx::{mysql::MySqlRow, postgres::PgRow, sqlite::SqliteRow, Column, Row, TypeInfo};
use uuid::Uuid;

pub fn sqlite_row(row: &SqliteRow) -> Map<String, Value> {
    row.columns()
        .iter()
        .enumerate()
        .map(|(index, column)| {
            let kind = column.type_info().name().to_ascii_uppercase();
            let value = match kind.as_str() {
                "INTEGER" | "INT" => option_json(row.try_get::<Option<i64>, _>(index)),
                "REAL" | "FLOAT" | "DOUBLE" => option_json(row.try_get::<Option<f64>, _>(index)),
                "BLOB" => option_bytes(row.try_get::<Option<Vec<u8>>, _>(index)),
                "NULL" => Value::Null,
                _ => option_json(row.try_get::<Option<String>, _>(index)),
            };
            (column.name().to_string(), value)
        })
        .collect()
}

pub fn postgres_row(row: &PgRow) -> Map<String, Value> {
    row.columns()
        .iter()
        .enumerate()
        .map(|(index, column)| {
            let kind = column.type_info().name().to_ascii_uppercase();
            let value = match kind.as_str() {
                "BOOL" => option_json(row.try_get::<Option<bool>, _>(index)),
                "INT2" => option_json(row.try_get::<Option<i16>, _>(index)),
                "INT4" => option_json(row.try_get::<Option<i32>, _>(index)),
                "INT8" => option_json(row.try_get::<Option<i64>, _>(index)),
                "FLOAT4" => option_json(row.try_get::<Option<f32>, _>(index)),
                "FLOAT8" => option_json(row.try_get::<Option<f64>, _>(index)),
                "NUMERIC" => {
                    option_string(row.try_get::<Option<sqlx::types::BigDecimal>, _>(index))
                }
                "UUID" => option_string(row.try_get::<Option<Uuid>, _>(index)),
                "DATE" => option_string(row.try_get::<Option<NaiveDate>, _>(index)),
                "TIME" => option_string(row.try_get::<Option<NaiveTime>, _>(index)),
                "TIMESTAMP" => option_string(row.try_get::<Option<NaiveDateTime>, _>(index)),
                "TIMESTAMPTZ" => option_string(row.try_get::<Option<DateTime<Utc>>, _>(index)),
                "JSON" | "JSONB" => option_json(row.try_get::<Option<Value>, _>(index)),
                "BYTEA" => option_bytes(row.try_get::<Option<Vec<u8>>, _>(index)),
                _ => option_json(row.try_get::<Option<String>, _>(index)),
            };
            (column.name().to_string(), value)
        })
        .collect()
}

pub fn mysql_row(row: &MySqlRow) -> Map<String, Value> {
    row.columns()
        .iter()
        .enumerate()
        .map(|(index, column)| {
            let kind = column.type_info().name().to_ascii_uppercase();
            let value = if kind.contains("UNSIGNED") {
                option_json(row.try_get::<Option<u64>, _>(index))
            } else if kind.contains("INT") || kind == "YEAR" {
                option_json(row.try_get::<Option<i64>, _>(index))
            } else if matches!(kind.as_str(), "FLOAT" | "DOUBLE") {
                option_json(row.try_get::<Option<f64>, _>(index))
            } else if matches!(kind.as_str(), "DECIMAL" | "NEWDECIMAL") {
                option_string(row.try_get::<Option<sqlx::types::BigDecimal>, _>(index))
            } else if kind == "DATE" {
                option_string(row.try_get::<Option<NaiveDate>, _>(index))
            } else if matches!(kind.as_str(), "DATETIME" | "TIMESTAMP") {
                option_string(row.try_get::<Option<NaiveDateTime>, _>(index))
            } else if kind == "TIME" {
                option_string(row.try_get::<Option<NaiveTime>, _>(index))
            } else if kind == "JSON" {
                option_json(row.try_get::<Option<Value>, _>(index))
            } else if matches!(
                kind.as_str(),
                "BLOB" | "LONGBLOB" | "MEDIUMBLOB" | "TINYBLOB" | "BINARY" | "VARBINARY"
            ) {
                option_bytes(row.try_get::<Option<Vec<u8>>, _>(index))
            } else {
                option_json(row.try_get::<Option<String>, _>(index))
            };
            (column.name().to_string(), value)
        })
        .collect()
}

fn option_json<T: Serialize>(result: Result<Option<T>, sqlx::Error>) -> Value {
    match result {
        Ok(Some(value)) => serde_json::to_value(value).unwrap_or(Value::Null),
        Ok(None) => Value::Null,
        Err(_) => json!("<unsupported value>"),
    }
}

fn option_string<T: ToString>(result: Result<Option<T>, sqlx::Error>) -> Value {
    match result {
        Ok(Some(value)) => Value::String(value.to_string()),
        Ok(None) => Value::Null,
        Err(_) => json!("<unsupported value>"),
    }
}

fn option_bytes(result: Result<Option<Vec<u8>>, sqlx::Error>) -> Value {
    match result {
        Ok(Some(value)) => Value::String(format!(
            "base64:{}",
            base64::engine::general_purpose::STANDARD.encode(value)
        )),
        Ok(None) => Value::Null,
        Err(_) => json!("<unsupported binary>"),
    }
}
