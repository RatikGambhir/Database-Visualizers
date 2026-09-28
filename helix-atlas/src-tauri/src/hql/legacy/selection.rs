//! Legacy flat traversal steps and terminals.

use super::predicates::predicate;
use crate::hql::{Condition, EntityKind, HopDirection, HqlError, Selection};
use serde_json::{json, Map, Value};

pub(super) fn named(name: &str, steps: Vec<Value>) -> Value {
    json!({ "Query": { "name": name, "steps": steps, "condition": null } })
}

pub(super) fn selection_steps(
    selection: &Selection,
    default_limit: Option<u64>,
) -> Result<Vec<Value>, HqlError> {
    let mut steps = source_steps(
        selection.source.entity,
        selection.source.label.as_deref(),
        selection.condition.as_ref(),
    )?;
    for hop in &selection.hops {
        steps.push(hop_step(hop.direction, hop.label.as_deref()));
        if let Some(condition) = &hop.condition {
            steps.push(json!({ "Where": predicate(condition)? }));
        }
    }
    if selection.distinct {
        steps.push(json!("Dedup"));
    }
    for term in &selection.order_by {
        steps.push(json!({
            "OrderBy": [term.column.source, if term.descending { "Desc" } else { "Asc" }]
        }));
    }
    if let Some(skip) = selection.skip {
        steps.push(json!({ "Skip": skip }));
    }
    if let Some(limit) = selection.limit.or(default_limit) {
        steps.push(json!({ "Limit": limit }));
    }
    Ok(steps)
}

fn source_steps(
    entity: EntityKind,
    label: Option<&str>,
    condition: Option<&Condition>,
) -> Result<Vec<Value>, HqlError> {
    let mut filters = Vec::new();
    if let Some(label) = label {
        filters.push(json!({ "Eq": ["$label", { "String": label }] }));
    }
    if let Some(condition) = condition {
        filters.push(predicate(condition)?);
    }
    let combined = match filters.len() {
        0 => None,
        1 => filters.pop(),
        _ => Some(json!({ "And": filters })),
    };
    if let Some(combined) = combined {
        return Ok(vec![if entity == EntityKind::Nodes {
            json!({ "NWhere": combined })
        } else {
            json!({ "EWhere": combined })
        }]);
    }
    Ok(if entity == EntityKind::Nodes {
        vec![json!({ "N": "All" })]
    } else {
        vec![
            json!({ "N": "All" }),
            json!({ "OutE": null }),
            json!("Dedup"),
        ]
    })
}

fn hop_step(direction: HopDirection, label: Option<&str>) -> Value {
    let name = match direction {
        HopDirection::Out => "Out",
        HopDirection::In => "In",
        HopDirection::Both => "Both",
        HopDirection::OutE => "OutE",
        HopDirection::InE => "InE",
        HopDirection::BothE => "BothE",
        HopDirection::FromNode => "OutN",
        HopDirection::ToNode => "InN",
        HopDirection::OtherNode => "OtherN",
    };
    let mut object = Map::new();
    object.insert(
        name.to_owned(),
        label.map_or(Value::Null, |value| json!(value)),
    );
    Value::Object(object)
}
pub(super) fn terminal_for(entity: EntityKind) -> Value {
    if entity == EntityKind::Nodes {
        json!({ "ValueMap": null })
    } else {
        json!("EdgeProperties")
    }
}
