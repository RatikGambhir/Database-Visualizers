//! Entity metadata extraction, distinct from stored properties.

use super::model::Row;
use serde_json::Value;

pub(super) fn first<'a>(row: &'a Row, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|key| row.get(*key))
}

pub(super) fn read_id(value: &Value) -> Option<String> {
    match value {
        Value::String(value) if value.parse::<u64>().is_ok() => Some(value.clone()),
        Value::Number(value) if value.as_u64().is_some() => Some(value.to_string()),
        _ => None,
    }
}

pub(super) fn read_label(value: &Value) -> Option<String> {
    value
        .as_str()
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}
