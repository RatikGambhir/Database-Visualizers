//! Typed IPC values. Numeric strings are parsed in Rust, never through a JS number.
use super::*;
use std::collections::BTreeMap;

/// Scalar data supplied separately from HelixSQL source.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(
    tag = "type",
    content = "value",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum ParameterValue {
    String(String),
    Integer(String),
    Float(f64),
    Boolean(bool),
    Null,
    NodeId(String),
}
pub type Parameters = BTreeMap<String, ParameterValue>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ParameterUse {
    Property,
    NodeId,
    String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParameterRequirement {
    pub name: String,
    pub usage: ParameterUse,
}

pub(super) struct Resolver<'a> {
    values: &'a Parameters,
    uses: BTreeMap<String, ParameterUse>,
}
impl<'a> Resolver<'a> {
    pub(super) fn new(values: &'a Parameters) -> Self {
        Self {
            values,
            uses: BTreeMap::new(),
        }
    }

    pub(super) fn resolve(
        &mut self,
        value: &mut Literal,
        usage: ParameterUse,
    ) -> Result<(), HqlError> {
        let Literal::Parameter { name, span } = value else {
            return Ok(());
        };
        let fail = |code, message| super::mutation::error(code, message, Some(span.clone()));
        if let Some(previous) = self.uses.get(name) {
            if (*previous == ParameterUse::NodeId) != (usage == ParameterUse::NodeId) {
                return Err(fail(
                    "parameter_type",
                    format!("parameter :{name} is reused as both a node ID and a property"),
                ));
            }
        }
        let supplied = self
            .values
            .get(name)
            .ok_or_else(|| fail("missing_parameter", format!("missing parameter :{name}")))?;
        let literal = match (usage, supplied) {
            (ParameterUse::NodeId, ParameterValue::NodeId(text)) => {
                if text.is_empty()
                    || !text.bytes().all(|b| b.is_ascii_digit())
                    || text.parse::<u64>().is_err()
                {
                    return Err(fail(
                        "integer_range",
                        format!("parameter :{name} must be an unsigned 64-bit decimal node ID"),
                    ));
                }
                Literal::Integer(text.clone())
            }
            (ParameterUse::NodeId, _) | (_, ParameterValue::NodeId(_)) => {
                return Err(fail(
                    "parameter_type",
                    format!("parameter :{name} has an incompatible type; endpoints require nodeId"),
                ))
            }
            (_, ParameterValue::String(v)) => Literal::String(v.clone()),
            (_, ParameterValue::Integer(v)) => {
                let digits = v.strip_prefix('-').unwrap_or(v);
                if digits.is_empty()
                    || !digits.bytes().all(|b| b.is_ascii_digit())
                    || v.parse::<i64>().is_err()
                {
                    return Err(fail(
                        "integer_range",
                        format!("parameter :{name} must be a signed 64-bit decimal integer"),
                    ));
                }
                Literal::Integer(v.clone())
            }
            (_, ParameterValue::Float(v)) if v.is_finite() => Literal::Float(*v),
            (_, ParameterValue::Float(_)) => {
                return Err(fail(
                    "parameter_type",
                    format!("parameter :{name} must be finite"),
                ))
            }
            (_, ParameterValue::Boolean(v)) => Literal::Boolean(*v),
            (_, ParameterValue::Null) => Literal::Null,
        };
        if usage == ParameterUse::String && !matches!(literal, Literal::String(_)) {
            return Err(fail(
                "parameter_type",
                format!("parameter :{name} must be a string for LIKE"),
            ));
        }
        // Keep the more specific requirement if the same string also appears in a property.
        self.uses
            .entry(name.clone())
            .and_modify(|v| {
                if usage == ParameterUse::String {
                    *v = usage;
                }
            })
            .or_insert(usage);
        *value = literal;
        Ok(())
    }

    pub(super) fn condition(&mut self, condition: &mut Condition) -> Result<(), HqlError> {
        fn usage(column: &ColumnRef) -> ParameterUse {
            if identity_column(column) {
                ParameterUse::NodeId
            } else {
                ParameterUse::Property
            }
        }
        match condition {
            Condition::And(parts) | Condition::Or(parts) => {
                for part in parts {
                    self.condition(part)?;
                }
            }
            Condition::Not(part) => self.condition(part)?,
            Condition::Compare { column, value, .. } => self.resolve(value, usage(column))?,
            Condition::Between { column, low, high } => {
                self.resolve(low, usage(column))?;
                self.resolve(high, usage(column))?;
            }
            Condition::In { column, values, .. } => {
                for value in values {
                    self.resolve(value, usage(column))?;
                }
            }
            Condition::Like { pattern, .. } => self.resolve(pattern, ParameterUse::String)?,
            Condition::IsNull { .. } | Condition::Has(_) => {}
        }
        Ok(())
    }

    pub(super) fn read(&mut self, statement: &mut Statement) -> Result<(), HqlError> {
        let selection = match statement {
            Statement::Select(value) => &mut value.selection,
            Statement::Graph(value) => &mut value.selection,
            Statement::Show(_) | Statement::Describe(_) => return Ok(()),
        };
        if let Some(condition) = &mut selection.condition {
            self.condition(condition)?;
        }
        for hop in &mut selection.hops {
            if let Some(condition) = &mut hop.condition {
                self.condition(condition)?;
            }
        }
        Ok(())
    }

    pub(super) fn finish(&self) -> Result<Vec<ParameterRequirement>, HqlError> {
        if let Some(name) = self
            .values
            .keys()
            .find(|name| !self.uses.contains_key(*name))
        {
            return Err(super::mutation::error(
                "unused_parameter",
                format!("unused parameter :{name}"),
                None,
            ));
        }
        Ok(self
            .uses
            .iter()
            .map(|(name, usage)| ParameterRequirement {
                name: name.clone(),
                usage: *usage,
            })
            .collect())
    }
}
