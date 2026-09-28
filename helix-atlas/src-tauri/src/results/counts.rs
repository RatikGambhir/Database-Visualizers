//! Scalar counts and grouped label counts.

use super::json::value_text;
use super::model::{LabelCount, ResultError};
use serde_json::Value;
use std::collections::HashMap;

pub(super) fn read_count(value: &Value) -> Result<u64, ResultError> {
    let unwrapped = value
        .as_array()
        .and_then(|values| values.first())
        .unwrap_or(value);
    if let Some(value) = number_to_u64(unwrapped) {
        return Ok(value);
    }
    if let Some(object) = unwrapped.as_object() {
        for key in ["count", "value", "total"] {
            if let Some(value) = object.get(key).and_then(number_to_u64) {
                return Ok(value);
            }
        }
    }
    Err(ResultError::new("expected a count", value))
}

fn number_to_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|number| u64::try_from(number).ok()))
        .or_else(|| value.as_str().and_then(|number| number.parse().ok()))
}

pub(super) fn read_group_count(value: &Value) -> Result<Vec<LabelCount>, ResultError> {
    let unwrapped = value
        .as_object()
        .and_then(|object| object.get("properties"))
        .filter(|value| value.is_array())
        .unwrap_or(value);
    let mut groups = Vec::new();
    if let Some(object) = unwrapped.as_object() {
        for (label, count) in object {
            groups.push(LabelCount {
                label: label.clone(),
                count: number_to_u64(count).unwrap_or(0),
            });
        }
    } else if let Some(entries) = unwrapped.as_array() {
        let mut sampled: HashMap<String, u64> = HashMap::new();
        for entry in entries.iter().filter_map(Value::as_object) {
            let label = ["key", "group", "label", "value", "_label", "$label"]
                .into_iter()
                .find_map(|key| entry.get(key));
            let Some(label) = label else { continue };
            let name = value_text(label);
            let count = ["count", "total", "n"]
                .into_iter()
                .find_map(|key| entry.get(key))
                .and_then(number_to_u64);
            if let Some(count) = count {
                groups.push(LabelCount { label: name, count });
            } else {
                *sampled.entry(name).or_default() += 1;
            }
        }
        groups.extend(
            sampled
                .into_iter()
                .map(|(label, count)| LabelCount { label, count }),
        );
    } else {
        return Err(ResultError::new("expected a grouped count", value));
    }
    groups.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.label.cmp(&right.label))
    });
    Ok(groups)
}
