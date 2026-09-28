//! Strict version-specific response adaptation before constructing view models.
use super::json::{parse_body, value_text};
use super::rows::read_property_rows;
use super::{read_result, QueryResult, ResultError, Row};
use crate::hql::{CompiledQuery, Protocol, ResultShape};
use serde_json::Value;
pub(crate) fn decode_compiled_response(
    body: &str,
    compiled: &CompiledQuery,
) -> Result<QueryResult, ResultError> {
    let parsed = adapt_response(parse_body(body)?, compiled)?;
    read_result(&parsed, &compiled.shape)
}

pub(crate) fn decode_compiled_rows_for_schema(
    body: &str,
    compiled: &CompiledQuery,
) -> Result<Vec<Row>, ResultError> {
    let parsed = adapt_response(parse_body(body)?, compiled)?;
    let ResultShape::Rows {
        variable,
        identity_variable,
        ..
    } = &compiled.shape
    else {
        return Err(ResultError::new("schema sample is not rows", &parsed));
    };
    read_property_rows(&parsed, variable, identity_variable.as_deref())
}

/// V2 returns are a flat named object. The cardinality checks below verify that
/// projections of the same injected binding retain one value per input row.
fn adapt_response(mut parsed: Value, compiled: &CompiledQuery) -> Result<Value, ResultError> {
    if compiled.protocol == Protocol::LegacyV1 {
        return Ok(parsed);
    }
    let object = parsed
        .as_object()
        .ok_or_else(|| ResultError::new("expected named v2 returns", &parsed))?;
    for name in &compiled.returns {
        if !object.contains_key(name) {
            return Err(ResultError::new(
                format!("missing v2 return {name:?}"),
                &parsed,
            ));
        }
    }
    for projection in &compiled.projections {
        let mut rows = strict_rows(&parsed[&projection.variable])?;
        let ids = scalar_values(&parsed[&projection.ids]);
        let labels = scalar_values(&parsed[&projection.labels]);
        if rows.len() != ids.len() || rows.len() != labels.len() {
            return Err(ResultError::new(
                "bound projection cardinality mismatch",
                &parsed,
            ));
        }
        let endpoints = projection
            .endpoints
            .as_ref()
            .map(|(from, to)| (scalar_values(&parsed[from]), scalar_values(&parsed[to])));
        if endpoints
            .as_ref()
            .is_some_and(|(from, to)| from.len() != rows.len() || to.len() != rows.len())
        {
            return Err(ResultError::new(
                "bound endpoint cardinality mismatch",
                &parsed,
            ));
        }
        for (index, row) in rows.iter_mut().enumerate() {
            let id = ids[index].as_u64().ok_or_else(|| {
                ResultError::new("expected exact unsigned entity ID", &ids[index])
            })?;
            let label = labels[index]
                .as_str()
                .ok_or_else(|| ResultError::new("expected entity label", &labels[index]))?;
            row.insert("$id".into(), Value::String(id.to_string()));
            row.insert("$label".into(), Value::String(label.into()));
            if let Some((from, to)) = &endpoints {
                for (key, values) in [("$from", from), ("$to", to)] {
                    let id = values[index].as_u64().ok_or_else(|| {
                        ResultError::new("expected exact unsigned endpoint ID", &values[index])
                    })?;
                    row.insert(key.into(), Value::String(id.to_string()));
                }
            }
        }
        let value = Value::Array(rows.into_iter().map(Value::Object).collect());
        parsed[&projection.variable] = value;
    }
    if matches!(
        compiled.shape,
        ResultShape::DescribeNode | ResultShape::DescribeEdge
    ) {
        parsed["identity"] = parsed["entity"].clone();
    }
    let group_names: Vec<(&str, &str)> = match &compiled.shape {
        ResultShape::GroupCount {
            variable, source, ..
        } => vec![(variable, source)],
        ResultShape::Labels { nodes, edges } => nodes
            .iter()
            .chain(edges)
            .map(|s| (s.as_str(), "$label"))
            .collect(),
        ResultShape::Stats {
            node_labels,
            edge_labels,
            ..
        } => vec![(node_labels, "$label"), (edge_labels, "$label")],
        _ => vec![],
    };
    for (name, property) in group_names {
        let value = &parsed[name];
        let rows = value
            .as_array()
            .ok_or_else(|| ResultError::new("expected v2 grouped rows", value))?;
        let mut groups = Vec::new();
        for row in rows {
            let group = row
                .get(property)
                .ok_or_else(|| ResultError::new("missing grouping property", row))?;
            let count = row
                .get("count")
                .and_then(Value::as_u64)
                .ok_or_else(|| ResultError::new("invalid grouped count", row))?;
            groups.push(serde_json::json!({"key":value_text(group),"count":count}));
        }
        parsed[name] = Value::Array(groups);
    }
    let count = |name: &str| -> Result<(), ResultError> {
        if parsed[name].as_u64().is_none() {
            return Err(ResultError::new(
                "expected v2 unsigned count",
                &parsed[name],
            ));
        }
        Ok(())
    };
    match &compiled.shape {
        ResultShape::Count { variable } => count(variable)?,

        ResultShape::Stats {
            node_count,
            edge_count,
            ..
        } => {
            count(node_count)?;
            count(edge_count)?;
        }
        ResultShape::DescribeNode => count("degree")?,
        _ => {}
    }
    Ok(parsed)
}
fn scalar_values(value: &Value) -> Vec<Value> {
    match value {
        Value::Null => vec![],
        Value::Array(values) => values.clone(),
        value => vec![value.clone()],
    }
}
fn strict_rows(value: &Value) -> Result<Vec<Row>, ResultError> {
    match value {
        Value::Null => Ok(vec![]),
        Value::Object(row) => Ok(vec![row.clone()]),
        Value::Array(values) => values
            .iter()
            .map(|v| {
                v.as_object()
                    .cloned()
                    .ok_or_else(|| ResultError::new("malformed v2 property row", v))
            })
            .collect(),
        _ => Err(ResultError::new("expected v2 property rows", value)),
    }
}
