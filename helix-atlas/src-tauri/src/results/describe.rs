//! Node and edge inspector results with bounded relationships.

use super::counts::read_count;
use super::graph::{read_graph_edge, read_graph_node};
use super::identity::{read_id, read_label};
use super::json::{make_row_safe, pick_variable};
use super::model::{DescribeResult, Endpoints, QueryResult, ResultError};
use super::rows::as_rows;
use serde_json::Value;

pub(super) fn read_node_description(body: &Value) -> Result<QueryResult, ResultError> {
    let mut properties = as_rows(pick_variable(body, "entity")?, "entity")?
        .into_iter()
        .next()
        .unwrap_or_default();
    properties.retain(|key, _| {
        !matches!(
            key.as_str(),
            "$id" | "$label" | "$from" | "$to" | "$from.$id" | "$to.$id"
        )
    });
    make_row_safe(&mut properties);
    let identity = as_rows(pick_variable(body, "identity")?, "identity")?
        .into_iter()
        .next()
        .unwrap_or_default();
    let edges = as_rows(pick_variable(body, "edges")?, "incident edges")?
        .iter()
        .filter_map(read_graph_edge)
        .collect();
    let mut neighbours = as_rows(pick_variable(body, "neighbours")?, "neighbours")?
        .iter()
        .filter_map(read_graph_node)
        .collect::<Vec<_>>();
    for neighbour in &mut neighbours {
        make_row_safe(&mut neighbour.properties);
    }
    Ok(QueryResult::Describe {
        data: Box::new(DescribeResult {
            entity: "nodes",
            id: identity.get("$id").and_then(read_id),
            label: identity.get("$label").and_then(read_label),
            properties,
            edges,
            neighbours,
            degree: Some(read_count(pick_variable(body, "degree")?)?),
            endpoints: None,
        }),
    })
}

pub(super) fn read_edge_description(body: &Value) -> Result<QueryResult, ResultError> {
    let mut properties = as_rows(pick_variable(body, "entity")?, "entity")?
        .into_iter()
        .next()
        .unwrap_or_default();
    properties.retain(|key, _| {
        !matches!(
            key.as_str(),
            "$id" | "$label" | "$from" | "$to" | "$from.$id" | "$to.$id"
        )
    });
    make_row_safe(&mut properties);
    let identity = as_rows(pick_variable(body, "identity")?, "identity")?
        .into_iter()
        .next()
        .unwrap_or_default();
    let source = as_rows(pick_variable(body, "sourceNode")?, "source node")?
        .first()
        .and_then(read_graph_node);
    let target = as_rows(pick_variable(body, "targetNode")?, "target node")?
        .first()
        .and_then(read_graph_node);
    Ok(QueryResult::Describe {
        data: Box::new(DescribeResult {
            entity: "edges",
            id: identity.get("$id").and_then(read_id),
            label: identity.get("$label").and_then(read_label),
            properties,
            edges: Vec::new(),
            neighbours: Vec::new(),
            degree: None,
            endpoints: Some(Endpoints { source, target }),
        }),
    })
}
