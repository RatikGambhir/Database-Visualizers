//! Operation-tree sources, traversals, ordering, and bounds.

use super::predicates::{exact_ids, pred, property_name, supported_property};
use crate::hql::legacy::single_property;
use crate::hql::validation::validate_nulls;
use crate::hql::{EntityKind, HopDirection, HqlError, Selection};
use serde_json::{json, Value};

pub(super) fn wrap(name: &str, input: Value, options: Value) -> Value {
    let mut body = options.as_object().cloned().unwrap_or_default();
    if matches!(name, "limit" | "skip") {
        if let Some(count) = body.get_mut("count") {
            *count = json!({"literal":count.clone()});
        }
    }
    body.insert("input".into(), input);
    single_property(name, Value::Object(body))
}
pub(super) fn source(entity: EntityKind, reference: Value) -> Value {
    single_property(
        if entity == EntityKind::Nodes {
            "nodes"
        } else {
            "edges"
        },
        json!({"reference":reference}),
    )
}
pub(super) fn all(entity: EntityKind) -> Value {
    source(entity, json!("all"))
}
pub(super) fn select(value: &Selection, default_limit: Option<u64>) -> Result<Value, HqlError> {
    let mut input = all(value.source.entity);
    if let Some(condition) = &value.condition {
        validate_nulls(condition)?;
        // IDs have their own u64 source encoding. This also avoids i64 clamping
        // in the official predicate evaluator at the upper boundary.
        if let Some(ids) = exact_ids(condition)? {
            input = source(value.source.entity, json!({"ids":ids}));
        } else {
            input = wrap("where", input, json!({"predicate":pred(condition)?}));
        }
    }
    if let Some(label) = &value.source.label {
        input = wrap(
            "where",
            input,
            json!({"predicate":{"eq":{"left":{"property":"$label"},"right":{"constant":{"string":label}}}}}),
        );
    }
    for hop in &value.hops {
        let name = match hop.direction {
            HopDirection::Out => "out",
            HopDirection::In => "in",
            HopDirection::Both => "both",
            HopDirection::OutE => "out_e",
            HopDirection::InE => "in_e",
            HopDirection::BothE => "both_e",
            HopDirection::FromNode => "in_n",
            HopDirection::ToNode => "out_n",
            HopDirection::OtherNode => "other_n",
        };
        input = wrap(
            name,
            input,
            if matches!(
                hop.direction,
                HopDirection::FromNode | HopDirection::ToNode | HopDirection::OtherNode
            ) {
                json!({})
            } else {
                json!({"label":hop.label})
            },
        );
        if let Some(condition) = &hop.condition {
            validate_nulls(condition)?;
            input = wrap("where", input, json!({"predicate":pred(condition)?}));
        }
    }
    if value.distinct {
        input = wrap("dedup", input, json!({}));
    }
    if !value.order_by.is_empty() {
        for term in &value.order_by {
            supported_property(&term.column)?;
        }
        let orderings = value
            .order_by
            .iter()
            .map(|t| {
                json!([
                    property_name(&t.column),
                    if t.descending { "desc" } else { "asc" }
                ])
            })
            .collect::<Vec<_>>();
        input = wrap("order_by_multiple", input, json!({"orderings":orderings}));
    }
    if let Some(skip) = value.skip {
        input = wrap("skip", input, json!({"count":skip}));
    }
    if let Some(limit) = value.limit.or(default_limit) {
        input = wrap("limit", input, json!({"count":limit}));
    }
    Ok(input)
}
