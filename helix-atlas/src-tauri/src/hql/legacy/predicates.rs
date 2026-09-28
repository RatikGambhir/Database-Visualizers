//! Legacy predicate and literal serialization.

use crate::hql::validation::validate_nulls;
use crate::hql::{ComparisonOperator, Condition, HqlError, Literal};
use serde_json::{json, Map, Value};

pub(in crate::hql) fn predicate(condition: &Condition) -> Result<Value, HqlError> {
    Ok(match condition {
        Condition::And(parts) => json!({
            "And": parts.iter().map(predicate).collect::<Result<Vec<_>, _>>()?
        }),
        Condition::Or(parts) => json!({
            "Or": parts.iter().map(predicate).collect::<Result<Vec<_>, _>>()?
        }),
        Condition::Not(part) => json!({ "Not": predicate(part)? }),
        Condition::Compare {
            column,
            operator,
            value,
        } => {
            if matches!(value, Literal::Null) {
                let name = match operator {
                    ComparisonOperator::Eq => "IsNull",
                    ComparisonOperator::Neq => "IsNotNull",
                    _ => {
                        return Err(HqlError::new(
                            "cannot use an ordering comparison with NULL",
                            Some(column.span.clone()),
                            Some("use IS NULL / IS NOT NULL"),
                        ))
                    }
                };
                single_property(name, json!(column.source))
            } else {
                let name = match operator {
                    ComparisonOperator::Eq => "Eq",
                    ComparisonOperator::Neq => "Neq",
                    ComparisonOperator::Gt => "Gt",
                    ComparisonOperator::Gte => "Gte",
                    ComparisonOperator::Lt => "Lt",
                    ComparisonOperator::Lte => "Lte",
                };
                single_property(name, json!([column.source, literal(value)]))
            }
        }
        Condition::Between { column, low, high } => {
            json!({ "Between": [column.source, literal(low), literal(high)] })
        }
        Condition::In {
            column,
            values,
            negated,
        } => {
            let values = values.iter().map(literal).collect::<Vec<_>>();
            let inner = json!({ "IsIn": [column.source, array_literal(&values)] });
            if *negated {
                json!({ "Not": inner })
            } else {
                inner
            }
        }
        Condition::Like {
            column,
            pattern,
            negated,
        } => {
            if pattern.contains('_') {
                return Err(HqlError::new(
                    "LIKE does not support the single-character wildcard _",
                    Some(column.span.clone()),
                    Some("use % for a run of characters"),
                ));
            }
            let starts = pattern.starts_with('%');
            let ends = pattern.ends_with('%');
            let start = usize::from(starts);
            let end = pattern.len().saturating_sub(usize::from(ends));
            let core = &pattern[start..end.max(start)];
            if core.contains('%') {
                return Err(HqlError::new(
                    "LIKE only supports % at the start and/or end of the pattern",
                    Some(column.span.clone()),
                    Some("for example 'ali%', '%son' or '%li%'"),
                ));
            }
            let variant = match (starts, ends) {
                (true, true) => "Contains",
                (false, true) => "StartsWith",
                (true, false) => "EndsWith",
                (false, false) => "Eq",
            };
            let inner = single_property(variant, json!([column.source, { "String": core }]));
            if *negated {
                json!({ "Not": inner })
            } else {
                inner
            }
        }
        Condition::IsNull { column, negated } => single_property(
            if *negated { "IsNotNull" } else { "IsNull" },
            json!(column.source),
        ),
        Condition::Has(column) => json!({ "HasKey": column.source }),
    })
}

pub(super) fn validate_condition(condition: Option<&Condition>) -> Result<(), HqlError> {
    if let Some(condition) = condition {
        let _ = predicate(condition)?;
        validate_nulls(condition)?;
    }
    Ok(())
}

fn literal(value: &Literal) -> Value {
    match value {
        Literal::String(value) => json!({ "String": value }),
        Literal::Integer(value) => {
            json!({ "I64": value.parse::<i64>().expect("validated signed literal") })
        }
        Literal::Float(value) => json!({ "F64": value }),
        Literal::Boolean(value) => json!({ "Bool": value }),
        Literal::Null => json!("Null"),
    }
}

fn array_literal(values: &[Value]) -> Value {
    if values.iter().all(|value| value.get("String").is_some()) {
        return json!({
            "StringArray": values.iter().filter_map(|value| value.get("String")).collect::<Vec<_>>()
        });
    }
    if values.iter().all(|value| value.get("I64").is_some()) {
        return json!({
            "I64Array": values.iter().filter_map(|value| value.get("I64")).collect::<Vec<_>>()
        });
    }
    json!({ "Array": values })
}

pub(in crate::hql) fn single_property(name: &str, value: Value) -> Value {
    let mut object = Map::new();
    object.insert(name.to_owned(), value);
    Value::Object(object)
}
