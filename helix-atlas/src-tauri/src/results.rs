//! HelixDB response decoding into stable, UI-facing view models.

mod adapter;
#[cfg(test)]
mod boundary_tests;
mod counts;
mod describe;
mod graph;
mod identity;
mod json;
mod model;
mod mutation;
mod rows;
#[cfg(test)]
mod tests;

pub(crate) use adapter::{decode_compiled_response, decode_compiled_rows_for_schema};
pub(crate) use json::make_value_safe;
pub use model::*;

use crate::hql::ResultShape;
use counts::{read_count, read_group_count};
use describe::{read_edge_description, read_node_description};
use graph::read_graph;
use identity::read_id;
#[cfg(test)]
use json::parse_body;
use json::{make_rows_safe, pick_variable};
#[cfg(test)]
use rows::read_property_rows;
use rows::{as_rows, collect_columns, read_rows};
use serde_json::Value;

/// Decodes property rows without applying the JSON-safe integer conversion
/// used at the IPC boundary. Schema inference needs the original JSON number
/// type so an i64 outside JavaScript's safe range is still classified as an
/// integer rather than as a string.
#[cfg(test)]
pub fn decode_rows_for_schema(body: &str, shape: &ResultShape) -> Result<Vec<Row>, ResultError> {
    let parsed = parse_body(body)?;
    let ResultShape::Rows {
        variable,
        identity_variable,
        ..
    } = shape
    else {
        return Err(ResultError::new(
            "the schema sample did not compile to a row result",
            &parsed,
        ));
    };
    read_property_rows(&parsed, variable, identity_variable.as_deref())
}
pub fn read_result(body: &Value, shape: &ResultShape) -> Result<QueryResult, ResultError> {
    match shape {
        ResultShape::Mutation { plan } => mutation::read_mutation(body, plan),
        ResultShape::UnavailableMutation => {
            Err(ResultError::new("mutation execution is unavailable", body))
        }
        ResultShape::Rows {
            variable,
            columns,
            sources,
            identity_variable,
        } => {
            let mut rows = if let (Some(columns), Some(sources)) = (columns, sources) {
                as_rows(pick_variable(body, variable)?, "rows")?
                    .into_iter()
                    .map(|row| {
                        columns
                            .iter()
                            .zip(sources)
                            .map(|(name, source)| {
                                let value = row
                                    .get(source)
                                    .or_else(|| match source.as_str() {
                                        "$from.$id" => row.get("$from"),
                                        "$to.$id" => row.get("$to"),
                                        _ => None,
                                    })
                                    .cloned()
                                    .unwrap_or(Value::Null);
                                let value =
                                    if matches!(source.as_str(), "$id" | "$from.$id" | "$to.$id") {
                                        read_id(&value).map_or(Value::Null, Value::String)
                                    } else {
                                        value
                                    };
                                (name.clone(), value)
                            })
                            .collect::<Row>()
                    })
                    .collect::<Vec<_>>()
            } else {
                read_rows(body, variable, identity_variable.as_deref())?
            };
            make_rows_safe(&mut rows);
            Ok(QueryResult::Rows {
                columns: columns.clone().unwrap_or_else(|| collect_columns(&rows)),
                rows,
            })
        }
        ResultShape::Count { variable } => Ok(QueryResult::Count {
            value: read_count(pick_variable(body, variable)?)?,
        }),
        ResultShape::GroupCount { variable, by, .. } => Ok(QueryResult::GroupCount {
            by: by.clone(),
            groups: read_group_count(pick_variable(body, variable)?)?,
        }),
        ResultShape::Graph {
            node_variable,
            edge_variable,
            node_limit,
            edge_limit,
        } => Ok(QueryResult::Graph {
            graph: read_graph(body, node_variable, edge_variable, *node_limit, *edge_limit)?,
        }),
        ResultShape::Labels { nodes, edges } => Ok(QueryResult::Labels {
            nodes: nodes
                .as_ref()
                .map(|name| read_group_count(pick_variable(body, name)?))
                .transpose()?,
            edges: edges
                .as_ref()
                .map(|name| read_group_count(pick_variable(body, name)?))
                .transpose()?,
        }),
        ResultShape::Stats {
            node_count,
            edge_count,
            node_labels,
            edge_labels,
        } => Ok(QueryResult::Stats {
            node_count: read_count(pick_variable(body, node_count)?)?,
            edge_count: read_count(pick_variable(body, edge_count)?)?,
            node_labels: read_group_count(pick_variable(body, node_labels)?)?,
            edge_labels: read_group_count(pick_variable(body, edge_labels)?)?,
        }),
        ResultShape::DescribeNode => read_node_description(body),
        ResultShape::DescribeEdge => read_edge_description(body),
    }
}
