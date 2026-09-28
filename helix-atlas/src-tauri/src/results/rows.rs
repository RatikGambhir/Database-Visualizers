//! Property rows, legacy identity association, and display column ordering.

use super::identity::{first, read_id};
use super::json::pick_variable;
use super::model::{ResultError, Row};
use serde_json::Value;
use std::collections::{BTreeSet, HashMap};

pub(super) fn read_rows(
    body: &Value,
    variable: &str,
    identity_variable: Option<&str>,
) -> Result<Vec<Row>, ResultError> {
    Ok(read_property_rows(body, variable, identity_variable)?
        .into_iter()
        .map(normalize_display_row)
        .collect())
}

pub(super) fn read_property_rows(
    body: &Value,
    variable: &str,
    identity_variable: Option<&str>,
) -> Result<Vec<Row>, ResultError> {
    let rows = as_rows(pick_variable(body, variable)?, "rows")?;
    let rows = if let Some(identity_variable) = identity_variable {
        merge_identity(
            rows,
            as_rows(pick_variable(body, identity_variable)?, "identity")?,
        )?
    } else {
        rows
    };
    Ok(rows)
}
pub(super) fn as_rows(value: &Value, context: &str) -> Result<Vec<Row>, ResultError> {
    if value.is_null() {
        return Ok(Vec::new());
    }
    if let Some(values) = value.as_array() {
        return values
            .iter()
            .map(|value| {
                value
                    .as_object()
                    .cloned()
                    .ok_or_else(|| ResultError::new(format!("malformed row for {context}"), value))
            })
            .collect();
    }
    if let Some(object) = value.as_object() {
        if let Some(properties) = object.get("properties").and_then(Value::as_array) {
            return Ok(properties
                .iter()
                .filter_map(Value::as_object)
                .cloned()
                .collect());
        }
        return Ok(vec![object.clone()]);
    }
    Err(ResultError::new(
        format!("expected rows for {context}"),
        value,
    ))
}
pub(super) fn merge_identity(rows: Vec<Row>, identity: Vec<Row>) -> Result<Vec<Row>, ResultError> {
    let mut by_id = HashMap::new();
    for row in identity {
        let id = first(&row, &["$id", "_id"])
            .and_then(read_id)
            .ok_or_else(|| {
                ResultError::new(
                    "legacy identity projection has no stable entity ID",
                    &Value::Object(row.clone()),
                )
            })?;
        if let Some(previous) = by_id.insert(id, row.clone()) {
            if previous != row {
                return Err(ResultError::new(
                    "conflicting identities",
                    &Value::Object(row),
                ));
            }
        }
    }
    rows.into_iter()
        .map(|mut row| {
            let id = first(&row, &["$id", "_id"])
                .and_then(read_id)
                .ok_or_else(|| {
                    ResultError::new(
                        "cannot associate legacy property rows with identities",
                        &Value::Object(row.clone()),
                    )
                })?;
            let identity = by_id.get(&id).ok_or_else(|| {
                ResultError::new("missing matching identity", &Value::Object(row.clone()))
            })?;
            for (key, value) in identity {
                if matches!(
                    key.as_str(),
                    "$id" | "$label" | "$from" | "$to" | "$from.$id" | "$to.$id"
                ) {
                    row.insert(key.clone(), value.clone());
                }
            }
            Ok(row)
        })
        .collect()
}

fn normalize_display_row(row: Row) -> Row {
    let mut normalized = row
        .iter()
        .filter(|(key, _)| {
            !matches!(
                key.as_str(),
                "$id" | "$label" | "$from" | "$to" | "$from.$id" | "$to.$id"
            )
        })
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<Row>();
    for (source, target) in [
        ("$id", "id"),
        ("$label", "label"),
        ("$from", "source"),
        ("$to", "target"),
        ("$from.$id", "source"),
        ("$to.$id", "target"),
    ] {
        if let Some(value) = row.get(source) {
            normalized.insert(
                target.into(),
                if target == "label" {
                    value.clone()
                } else {
                    read_id(value).map_or(Value::Null, Value::String)
                },
            );
        }
    }
    normalized
}

pub(super) fn collect_columns(rows: &[Row]) -> Vec<String> {
    let mut seen = BTreeSet::new();
    for row in rows {
        seen.extend(row.keys().cloned());
    }
    let mut columns = ["id", "label", "source", "target"]
        .into_iter()
        .filter(|key| seen.remove(*key))
        .map(str::to_owned)
        .collect::<Vec<_>>();
    columns.extend(seen);
    columns
}
