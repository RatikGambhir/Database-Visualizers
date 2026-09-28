//! Graph entities, deduplication, and dangling edge accounting.

use super::identity::{first, read_id, read_label};
use super::json::{make_row_safe, pick_variable};
use super::model::{GraphData, GraphEdgeData, GraphNodeData, ResultError, Row};
use super::rows::as_rows;
use serde_json::Value;
use std::collections::HashSet;

pub(super) fn read_graph(
    body: &Value,
    node_variable: &str,
    edge_variable: &str,
    node_limit: u64,
    edge_limit: u64,
) -> Result<GraphData, ResultError> {
    let node_rows = as_rows(pick_variable(body, node_variable)?, "graph nodes")?;
    let edge_rows = as_rows(pick_variable(body, edge_variable)?, "graph edges")?;
    let mut nodes = Vec::new();
    let mut seen = HashSet::new();
    for row in &node_rows {
        let mut node = read_graph_node(row).ok_or_else(|| {
            ResultError::new(
                "graph node is missing a valid identity",
                &Value::Object(row.clone()),
            )
        })?;
        if !seen.insert(node.id.clone()) {
            continue;
        }
        make_row_safe(&mut node.properties);
        nodes.push(node);
    }
    let mut edges = Vec::new();
    let mut edge_ids = HashSet::new();
    let mut dangling_edges = 0;
    for row in &edge_rows {
        let edge = read_graph_edge(row).ok_or_else(|| {
            ResultError::new(
                "graph edge is missing a valid identity or endpoint",
                &Value::Object(row.clone()),
            )
        })?;
        if !edge_ids.insert(edge.id.clone()) {
            continue;
        }
        if !seen.contains(&edge.source) || !seen.contains(&edge.target) {
            dangling_edges += 1;
            continue;
        }
        edges.push(edge);
    }
    Ok(GraphData {
        nodes,
        edges,
        dangling_edges,
        truncated_nodes: node_rows.len() as u64 >= node_limit,
        truncated_edges: edge_rows.len() as u64 >= edge_limit,
    })
}

pub(super) fn read_graph_node(row: &Row) -> Option<GraphNodeData> {
    let id = read_id(first(row, &["$id", "_id", "id"])?)?;
    let label = first(row, &["$label", "_label", "label"]).and_then(read_label);
    let mut properties = Row::new();
    for (key, value) in row {
        if !matches!(key.as_str(), "_id" | "_label" | "$id" | "$label") {
            properties.insert(key.clone(), value.clone());
        }
    }
    make_row_safe(&mut properties);
    Some(GraphNodeData {
        id,
        label,
        properties,
    })
}

pub(super) fn read_graph_edge(row: &Row) -> Option<GraphEdgeData> {
    Some(GraphEdgeData {
        id: read_id(first(row, &["$id", "_id", "id"])?)?,
        label: first(row, &["$label", "_label", "label"]).and_then(read_label),
        source: read_id(first(
            row,
            &["$from.$id", "$from", "_src", "from", "source"],
        )?)?,
        target: read_id(first(row, &["$to.$id", "$to", "_dst", "to", "target"])?)?,
    })
}
