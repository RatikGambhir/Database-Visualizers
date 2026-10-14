//! Strict receipt decoding after the server has acknowledged commit.
use super::*;
use crate::hql::{mutation_row_name, MutationPreview, PlannedStatement, Returning};

pub(super) fn read_mutation(
    body: &Value,
    plan: &MutationPreview,
) -> Result<QueryResult, ResultError> {
    let mut statements = Vec::with_capacity(plan.statements.len());
    let mut inserted_nodes = 0;
    let mut inserted_edges = 0;
    for statement in &plan.statements {
        let (index, kind, binding, count, returning) = match statement {
            PlannedStatement::Lookup {
                statement_index,
                binding,
                ..
            } => (*statement_index, "lookup", Some(binding.clone()), 1, None),
            PlannedStatement::Insert {
                statement_index,
                entity,
                binding,
                rows,
                returning,
                ..
            } => (
                *statement_index,
                *entity,
                binding.clone(),
                rows.len(),
                returning.as_ref(),
            ),
        };
        let mut ids = Vec::with_capacity(count);
        let mut rows = Vec::new();
        let mut entities = Vec::new();
        for tuple in 0..count {
            let name = mutation_row_name(index, tuple);
            let values = body[&name]
                .as_array()
                .ok_or_else(|| ResultError::new("missing mutation entity projection", body))?;
            if values.len() != 1 {
                return Err(ResultError::new(
                    "mutation expected one entity per input tuple",
                    body,
                ));
            }
            let object = values[0]
                .as_object()
                .ok_or_else(|| ResultError::new("invalid mutation entity", body))?;
            let id = object
                .get("$id")
                .and_then(Value::as_str)
                .ok_or_else(|| ResultError::new("missing mutation identity", body))?;
            ids.push(id.to_owned());
            match returning {
                Some(Returning::Columns(columns)) => {
                    let row = columns
                        .iter()
                        .map(|column| {
                            let source = match column.source.as_str() {
                                "$from.$id" => "$from",
                                "$to.$id" => "$to",
                                other => other,
                            };
                            let mut value = object.get(source).cloned().unwrap_or(Value::Null);
                            make_value_safe(&mut value);
                            (column.name.clone(), value)
                        })
                        .collect();
                    rows.push(row);
                }
                Some(Returning::Entities) => {
                    let mut properties = object
                        .iter()
                        .filter(|(key, _)| !key.starts_with('$'))
                        .map(|(k, v)| (k.clone(), v.clone()))
                        .collect::<Row>();
                    for value in properties.values_mut() {
                        make_value_safe(value);
                    }
                    entities.push(MutationEntity {
                        id: id.to_owned(),
                        label: object
                            .get("$label")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                        source: object
                            .get("$from")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                        target: object.get("$to").and_then(Value::as_str).map(str::to_owned),
                        properties,
                    });
                }
                None => {}
            }
        }
        match kind {
            "nodes" => inserted_nodes += count,
            "edges" => inserted_edges += count,
            _ => {}
        }
        statements.push(MutationStatementResult {
            statement_index: index,
            kind: kind.to_owned(),
            binding,
            ids,
            columns: match returning {
                Some(Returning::Columns(columns)) => {
                    columns.iter().map(|c| c.name.clone()).collect()
                }
                _ => Vec::new(),
            },
            identity_columns: match returning {
                Some(Returning::Columns(columns)) => columns
                    .iter()
                    .filter_map(|column| {
                        if !column.virtual_column {
                            return None;
                        }
                        let entity = match column.source.as_str() {
                            "$id" => {
                                if kind == "edges" {
                                    "edge"
                                } else {
                                    "node"
                                }
                            }
                            "$from" | "$to" | "$from.$id" | "$to.$id" => "node",
                            _ => return None,
                        };
                        Some((column.name.clone(), entity))
                    })
                    .collect(),
                _ => Default::default(),
            },
            rows,
            entities,
        });
    }
    Ok(QueryResult::Mutation {
        inserted_nodes,
        inserted_edges,
        statements,
        outcome: "committed",
        durability: "acknowledged",
    })
}
