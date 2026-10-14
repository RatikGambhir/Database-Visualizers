//! Atlas mutation extension: one batch, materialized creations, transactional guards.
use super::{
    batch::Batch,
    selection::{source, wrap},
};
use crate::hql::mutation::{MutationPreview, NodeReference, PlannedStatement, Returning};
use crate::hql::*;

pub(in crate::hql) fn compile(preview: MutationPreview) -> Result<CompiledQuery, HqlError> {
    let mut batch = Batch::default();
    for statement in &preview.statements {
        match statement {
            PlannedStatement::Lookup {
                statement_index,
                selection_json,
                ..
            } => {
                let name = row_name(*statement_index, 0);
                let selection: Value = serde_json::from_str(selection_json)
                    .map_err(|e| HqlError::plain(e.to_string()))?;
                // Two matches suffice to prove ambiguity; never hide it with LIMIT 1.
                batch.entities(
                    &name,
                    wrap("limit", selection, json!({"count":2})),
                    EntityKind::Nodes,
                    Some(&[]),
                );
                guard(&mut batch, &format!("__{name}_stream"));
            }
            PlannedStatement::Insert {
                statement_index,
                entity,
                label,
                rows,
                returning,
                ..
            } => {
                let kind = if *entity == "nodes" {
                    EntityKind::Nodes
                } else {
                    EntityKind::Edges
                };
                let properties = match returning {
                    Some(Returning::Entities) => None,
                    Some(Returning::Columns(columns)) => Some(
                        columns
                            .iter()
                            .filter(|c| !c.virtual_column)
                            .map(|c| c.source.clone())
                            .collect::<Vec<_>>(),
                    ),
                    None => Some(Vec::new()),
                };
                for (tuple, row) in rows.iter().enumerate() {
                    let name = row_name(*statement_index, tuple);
                    let values = row
                        .properties
                        .iter()
                        .map(|(key, value)| Ok(json!([key, {"value":property(value)?}])))
                        .collect::<Result<Vec<_>, HqlError>>()?;
                    let root = if kind == EntityKind::Nodes {
                        json!({"add_n":{"label":label,"properties":values}})
                    } else {
                        let from = endpoint(&mut batch, &name, "source", row.source.as_ref())?;
                        let to = endpoint(&mut batch, &name, "target", row.target.as_ref())?;
                        json!({"add_e":{"input":{"inject":{"variable":from}},"label":label,"to":{"var":to},"properties":values}})
                    };
                    batch.entities(&name, root, kind, properties.as_deref());
                    if kind == EntityKind::Nodes {
                        guard(&mut batch, &format!("__{name}_stream"));
                    }
                }
            }
        }
    }
    let request = json!({"request_type":"write","query_name":"helix_atlas_mutation_v1","query":{"write":{"entries":batch.entries,"returns":batch.returns}}});
    let transport_json =
        serde_json::to_string_pretty(&request).map_err(|e| HqlError::plain(e.to_string()))?;
    if transport_json.len() > 2 * 1024 * 1024 {
        return Err(crate::hql::mutation::error(
            "mutation_limit",
            "atomic write request exceeds 2 MiB",
            None,
        ));
    }
    Ok(CompiledQuery {
        protocol: Protocol::V2,
        returns: batch.returns,
        projections: batch.projections,
        transport_json,
        summary: format!(
            "Planned: {} nodes, {} edges in {} statements",
            preview.planned_nodes,
            preview.planned_edges,
            preview.statements.len()
        ),
        shape: ResultShape::Mutation {
            plan: Box::new(preview.clone()),
        },
        mutation: Some(preview),
    })
}

pub(crate) fn row_name(statement: usize, tuple: usize) -> String {
    format!("s{statement}_r{tuple}")
}

fn guard(batch: &mut Batch, variable: &str) {
    batch.entries.push(json!({"query":{"name":format!("{variable}_checked"),"condition":{"require_single_node":variable},"root":{"inject":{"variable":variable}}}}));
}

fn endpoint(
    batch: &mut Batch,
    row: &str,
    side: &str,
    reference: Option<&NodeReference>,
) -> Result<String, HqlError> {
    match reference {
        Some(NodeReference::Binding(statement)) => {
            Ok(format!("__{}_stream", row_name(*statement, 0)))
        }
        Some(NodeReference::Id(id)) => {
            let id = id
                .parse::<u64>()
                .map_err(|_| HqlError::plain("invalid validated node ID"))?;
            let name = format!("__{row}_{side}");
            batch.add(&name, source(EntityKind::Nodes, json!({"ids":[id]})), false);
            guard(batch, &name);
            Ok(name)
        }
        None => Err(HqlError::plain("missing validated edge endpoint")),
    }
}

fn property(value: &ParameterValue) -> Result<Value, HqlError> {
    Ok(match value {
        ParameterValue::String(v) => json!({"string":v}),
        ParameterValue::Integer(v) => {
            json!({"i64":v.parse::<i64>().map_err(|_|HqlError::plain("invalid validated integer"))?})
        }
        ParameterValue::Float(v) => json!({"f64":v}),
        ParameterValue::Boolean(v) => json!({"bool":v}),
        ParameterValue::Null => json!("null"),
        ParameterValue::NodeId(_) => {
            return Err(HqlError::plain("node ID cannot be stored as a property"))
        }
    })
}
