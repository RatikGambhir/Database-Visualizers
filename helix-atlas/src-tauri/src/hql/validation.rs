//! Adapter-independent read validation and exact numeric bounds.
use super::*;
pub(super) fn validate_hops(selection: &Selection) -> Result<EntityKind, HqlError> {
    let mut entity = selection.source.entity;
    for hop in &selection.hops {
        let starts_from_nodes = matches!(
            hop.direction,
            HopDirection::Out
                | HopDirection::In
                | HopDirection::Both
                | HopDirection::OutE
                | HopDirection::InE
                | HopDirection::BothE
        );
        if starts_from_nodes && entity == EntityKind::Edges {
            return Err(HqlError::new(
                format!(
                    "TRAVERSE {} starts from a node, but the query is on edges here",
                    direction_name(hop.direction)
                ),
                Some(hop.span.clone()),
                Some("step back onto nodes first with TRAVERSE SOURCE, TARGET or OTHER"),
            ));
        }
        if !starts_from_nodes && entity == EntityKind::Nodes {
            return Err(HqlError::new(
                format!(
                    "TRAVERSE {} starts from an edge, but the query is on nodes here",
                    direction_name(hop.direction)
                ),
                Some(hop.span.clone()),
                Some("reach the edges first with TRAVERSE OUT EDGES / IN EDGES / BOTH EDGES"),
            ));
        }
        entity = if matches!(
            hop.direction,
            HopDirection::OutE | HopDirection::InE | HopDirection::BothE
        ) {
            EntityKind::Edges
        } else {
            EntityKind::Nodes
        };
    }
    Ok(entity)
}

pub(super) fn direction_name(direction: HopDirection) -> &'static str {
    match direction {
        HopDirection::Out => "OUT",
        HopDirection::In => "IN",
        HopDirection::Both => "BOTH",
        HopDirection::OutE => "OUT EDGES",
        HopDirection::InE => "IN EDGES",
        HopDirection::BothE => "BOTH EDGES",
        HopDirection::FromNode => "SOURCE",
        HopDirection::ToNode => "TARGET",
        HopDirection::OtherNode => "OTHER",
    }
}

pub(super) fn describe_selection(selection: &Selection) -> String {
    let mut parts = vec![format!(
        "{}{}",
        if selection.source.entity == EntityKind::Nodes {
            "nodes"
        } else {
            "edges"
        },
        selection
            .source
            .label
            .as_ref()
            .map(|label| format!(":{label}"))
            .unwrap_or_default()
    )];
    for hop in &selection.hops {
        parts.push(format!(
            "{}{}",
            direction_name(hop.direction)
                .to_ascii_lowercase()
                .replace(' ', ""),
            hop.label
                .as_ref()
                .map(|label| format!("({label})"))
                .unwrap_or_default()
        ));
    }
    parts.join(" → ")
}

pub(super) fn validate_nulls(condition: &Condition) -> Result<(), HqlError> {
    match condition {
        Condition::And(parts) | Condition::Or(parts) => {
            for part in parts {
                validate_nulls(part)?;
            }
        }
        Condition::Not(part) => validate_nulls(part)?,
        Condition::Compare {
            column,
            value: Literal::Null,
            ..
        }
        | Condition::IsNull { column, .. }
            if column.virtual_column =>
        {
            return Err(HqlError::new(
                format!("{} is never null", column.name),
                Some(column.span.clone()),
                None,
            ));
        }
        _ => {}
    }
    Ok(())
}

pub(super) fn identity_column(column: &ColumnRef) -> bool {
    column.virtual_column && matches!(column.source.as_str(), "$id" | "$from.$id" | "$to.$id")
}

pub(super) fn entity_id(value: &Literal, column: &ColumnRef) -> Result<u64, HqlError> {
    let text = match value {
        Literal::Integer(value) | Literal::String(value) => value,
        _ => {
            return Err(HqlError::new(
                "expected an unsigned entity ID",
                Some(column.span.clone()),
                None,
            ))
        }
    };
    text.parse::<u64>().map_err(|_| {
        HqlError::new(
            "entity ID is outside the unsigned 64-bit range",
            Some(column.span.clone()),
            Some("IDs include zero; negative IDs and overflow are invalid"),
        )
    })
}

pub(super) fn validate_numbers(statement: &Statement, protocol: Protocol) -> Result<(), HqlError> {
    fn check(value: &Literal, column: &ColumnRef, protocol: Protocol) -> Result<(), HqlError> {
        if identity_column(column) {
            let id = entity_id(value, column)?;
            if protocol == Protocol::LegacyV1 && id > i64::MAX as u64 {
                return Err(HqlError::new(
                    "legacy v1 IDs must fit in a signed 64-bit integer",
                    Some(column.span.clone()),
                    Some("switch to v2 for exact full-range ID lookup"),
                ));
            }
        } else if let Literal::Integer(text) = value {
            text.parse::<i64>().map_err(|_| {
                HqlError::new(
                    "integer property literal is outside the signed 64-bit range",
                    Some(column.span.clone()),
                    None,
                )
            })?;
        }
        Ok(())
    }
    fn condition(value: &Condition, protocol: Protocol) -> Result<(), HqlError> {
        match value {
            Condition::And(parts) | Condition::Or(parts) => {
                for part in parts {
                    condition(part, protocol)?;
                }
            }
            Condition::Not(part) => condition(part, protocol)?,
            Condition::Compare { column, value, .. } if !matches!(value, Literal::Null) => {
                check(value, column, protocol)?
            }
            Condition::Between { column, low, high } => {
                check(low, column, protocol)?;
                check(high, column, protocol)?;
            }
            Condition::In { column, values, .. } => {
                for value in values {
                    check(value, column, protocol)?;
                }
            }
            _ => {}
        }
        Ok(())
    }
    let selection = match statement {
        Statement::Select(value) => Some(&value.selection),
        Statement::Graph(value) => Some(&value.selection),
        Statement::Describe(value)
            if protocol == Protocol::LegacyV1 && value.id > i64::MAX as u64 =>
        {
            return Err(HqlError::new(
                "legacy v1 IDs must fit in a signed 64-bit integer",
                Some(value.id_span.clone()),
                Some("switch to v2 for full-range IDs"),
            ))
        }
        _ => None,
    };
    if let Some(selection) = selection {
        if let Some(value) = &selection.condition {
            condition(value, protocol)?;
        }
        for hop in &selection.hops {
            if let Some(value) = &hop.condition {
                condition(value, protocol)?;
            }
        }
    }
    Ok(())
}
