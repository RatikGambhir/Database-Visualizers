//! V2 predicate lowering and exact unsigned ID lookups.

use crate::hql::legacy::{predicate, single_property};
use crate::hql::validation::{entity_id, identity_column};
use crate::hql::{ColumnRef, ComparisonOperator, Condition, HqlError, Literal};
use serde_json::{json, Map, Value};

pub(super) fn exact_ids(condition: &Condition) -> Result<Option<Vec<u64>>, HqlError> {
    match condition {
        Condition::Compare {
            column,
            operator: ComparisonOperator::Eq,
            value,
        } if column.virtual_column && column.source == "$id" => {
            Ok(Some(vec![entity_id(value, column)?]))
        }
        Condition::In {
            column,
            values,
            negated: false,
        } if column.virtual_column && column.source == "$id" => {
            let mut ids = values
                .iter()
                .map(|v| entity_id(v, column))
                .collect::<Result<Vec<_>, _>>()?;
            let mut seen = std::collections::HashSet::new();
            ids.retain(|id| seen.insert(*id));
            Ok(Some(ids))
        }
        _ => Ok(None),
    }
}
pub(super) fn property_name(column: &ColumnRef) -> &str {
    match column.source.as_str() {
        "$from.$id" => "$from",
        "$to.$id" => "$to",
        _ => &column.source,
    }
}
pub(super) fn supported_property(column: &ColumnRef) -> Result<(), HqlError> {
    if identity_column(column) {
        return Err(HqlError::new(
            "this v2 server cannot order or group full-range virtual IDs exactly",
            Some(column.span.clone()),
            Some(
                "order/group by a property; use DESCRIBE or a direct WHERE id lookup for exact IDs",
            ),
        ));
    }
    Ok(())
}
fn constant(value: &Literal, column: &ColumnRef) -> Result<Value, HqlError> {
    let tagged = if identity_column(column) {
        let id = entity_id(value, column)?;
        if id >= i64::MAX as u64 {
            return Err(HqlError::new("this v2 predicate cannot represent this ID exactly",Some(column.span.clone()),Some("use DESCRIBE or a direct WHERE id = / id IN lookup; compound, endpoint and range comparisons at this boundary are unsupported")));
        }
        json!({"i64":id})
    } else {
        match value {
            Literal::Integer(v) => {
                json!({"i64":v.parse::<i64>().map_err(|_|HqlError::plain("signed property integer overflow"))?})
            }
            Literal::Float(v) => json!({"f64":v}),
            Literal::String(v) => json!({"string":v}),
            Literal::Boolean(v) => json!({"bool":v}),
            Literal::Null => json!("null"),
        }
    };
    Ok(json!({"constant":tagged}))
}
pub(super) fn pred(condition: &Condition) -> Result<Value, HqlError> {
    Ok(match condition {
        Condition::And(parts) | Condition::Or(parts) => single_property(
            if matches!(condition, Condition::And(_)) {
                "and"
            } else {
                "or"
            },
            json!({"predicates":parts.iter().map(pred).collect::<Result<Vec<_>,_>>()?}),
        ),
        Condition::Not(p) => json!({"not":{"predicate":pred(p)?}}),
        Condition::Compare {
            column,
            operator,
            value,
        } => {
            if matches!(value, Literal::Null) {
                single_property(
                    match operator {
                        ComparisonOperator::Eq => "is_null",
                        ComparisonOperator::Neq => "is_not_null",
                        _ => {
                            return Err(HqlError::new(
                                "cannot order NULL",
                                Some(column.span.clone()),
                                Some("use IS NULL"),
                            ))
                        }
                    },
                    json!({"property":property_name(column)}),
                )
            } else {
                single_property(
                    match operator {
                        ComparisonOperator::Eq => "eq",
                        ComparisonOperator::Neq => "neq",
                        ComparisonOperator::Gt => "gt",
                        ComparisonOperator::Gte => "gte",
                        ComparisonOperator::Lt => "lt",
                        ComparisonOperator::Lte => "lte",
                    },
                    json!({"left":{"property":property_name(column)},"right":constant(value,column)?}),
                )
            }
        }
        Condition::Between { column, low, high } => {
            json!({"between":{"value":{"property":property_name(column)},"min":constant(low,column)?,"max":constant(high,column)?}})
        }
        Condition::In {
            column,
            values,
            negated,
        } => {
            let values = values
                .iter()
                .map(|v| constant(v, column).map(|c| c["constant"].clone()))
                .collect::<Result<Vec<_>, _>>()?;
            let p = json!({"is_in":{"value":{"property":property_name(column)},"values":{"constant":{"array":values}}}});
            if *negated {
                json!({"not":{"predicate":p}})
            } else {
                p
            }
        }
        Condition::Like {
            column,
            pattern,
            negated,
        } => {
            // Reuse language validation, not wire serialization.
            predicate(condition)?;
            let start = pattern.starts_with('%');
            let end = pattern.ends_with('%');
            let core = &pattern[usize::from(start)
                ..pattern
                    .len()
                    .saturating_sub(usize::from(end))
                    .max(usize::from(start))];
            let (op, arg) = match (start, end) {
                (true, true) => ("contains", "substring"),
                (true, false) => ("ends_with", "suffix"),
                (false, true) => ("starts_with", "prefix"),
                _ => ("eq", "right"),
            };
            let mut args = Map::new();
            args.insert(
                if op == "eq" { "left" } else { "value" }.into(),
                json!({"property":property_name(column)}),
            );
            args.insert(arg.into(), json!({"constant":{"string":core}}));
            let p = single_property(op, Value::Object(args));
            if *negated {
                json!({"not":{"predicate":p}})
            } else {
                p
            }
        }
        Condition::IsNull { column, negated } => single_property(
            if *negated { "is_not_null" } else { "is_null" },
            json!({"property":property_name(column)}),
        ),
        Condition::Has(column) => json!({"has_key":{"property":property_name(column)}}),
    })
}
