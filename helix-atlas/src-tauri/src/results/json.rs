//! Response envelopes and exact integer conversion at the IPC boundary.

use super::model::{ResultError, Row};
use serde_json::{Number, Value};

const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

pub(super) fn parse_body(body: &str) -> Result<Value, ResultError> {
    serde_json::from_str(body).map_err(|error| ResultError {
        message: "the instance returned a body that is not JSON".into(),
        detail: Some(error.to_string()),
    })
}
pub(super) fn pick_variable<'a>(body: &'a Value, name: &str) -> Result<&'a Value, ResultError> {
    if body.is_array() || !body.is_object() {
        return Ok(body);
    }
    let object = body.as_object().expect("checked object");
    if let Some(value) = object.get(name) {
        return Ok(value);
    }
    for wrapper in ["data", "result", "results"] {
        if let Some(value) = object
            .get(wrapper)
            .and_then(Value::as_object)
            .and_then(|inner| inner.get(name))
        {
            return Ok(value);
        }
    }
    if object.len() == 1 {
        return Ok(object.values().next().expect("one value"));
    }
    Err(ResultError::new(
        format!("the response has no variable named {name:?}"),
        body,
    ))
}
pub(super) fn make_rows_safe(rows: &mut [Row]) {
    for row in rows {
        make_row_safe(row);
    }
}

pub(super) fn make_row_safe(row: &mut Row) {
    for value in row.values_mut() {
        make_value_safe(value);
    }
}

pub(crate) fn make_value_safe(value: &mut Value) {
    match value {
        Value::Number(number) if number_outside_js_range(number) => {
            *value = Value::String(number.to_string());
        }
        Value::Array(values) => {
            for value in values {
                make_value_safe(value);
            }
        }
        Value::Object(values) => {
            for value in values.values_mut() {
                make_value_safe(value);
            }
        }
        _ => {}
    }
}

fn number_outside_js_range(number: &Number) -> bool {
    number
        .as_i64()
        .is_some_and(|value| !(-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&value))
        || number
            .as_u64()
            .is_some_and(|value| value > MAX_SAFE_INTEGER as u64)
}

pub(super) fn value_text(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(value) => value.clone(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        _ => serde_json::to_string(value).unwrap_or_else(|_| value.to_string()),
    }
}

pub(super) fn preview(body: &Value) -> String {
    let text = serde_json::to_string(body).unwrap_or_else(|_| body.to_string());
    if text.chars().count() <= 600 {
        text
    } else {
        format!("{}…", text.chars().take(600).collect::<String>())
    }
}
