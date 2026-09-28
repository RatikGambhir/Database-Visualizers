//! Statement-specific operation trees and result shapes.

use super::predicates::{property_name, supported_property};
use super::selection::{all, select, source, wrap};
use super::{Batch, CompiledStatement};
use crate::hql::validation::{describe_selection, validate_hops};
use crate::hql::{
    DescribeStatement, EntityKind, GraphStatement, HqlError, Projection, ResultShape,
    SelectStatement, ShowStatement, ShowTarget, DEFAULT_GRAPH_EDGE_LIMIT, DEFAULT_GRAPH_NODE_LIMIT,
    DEFAULT_ROW_LIMIT,
};
use serde_json::json;

pub(super) fn compile_select(
    batch: &mut Batch,
    value: &SelectStatement,
) -> Result<CompiledStatement, HqlError> {
    let entity = validate_hops(&value.selection)?;
    let selection = select(
        &value.selection,
        if matches!(value.projection, Projection::Count) {
            None
        } else {
            Some(DEFAULT_ROW_LIMIT)
        },
    )?;
    Ok(match &value.projection {
        Projection::Count => {
            if let Some(by) = &value.group_by {
                supported_property(by)?;
                if by.source == "count" {
                    return Err(HqlError::new(
                        "grouping by count conflicts with the v2 count output",
                        Some(by.span.clone()),
                        Some("choose a different grouping property"),
                    ));
                }
                batch.add(
                    "rows",
                    wrap(
                        "group_count",
                        selection,
                        json!({"property": property_name(by)}),
                    ),
                    true,
                );
                (
                    ResultShape::GroupCount {
                        variable: "rows".into(),
                        by: by.name.clone(),
                        source: property_name(by).into(),
                    },
                    format!("count grouped by {}", by.name),
                    "group_count",
                )
            } else {
                batch.add("rows", wrap("count", selection, json!({})), true);
                (
                    ResultShape::Count {
                        variable: "rows".into(),
                    },
                    "entity count".into(),
                    "count",
                )
            }
        }
        projection => {
            batch.entities("rows", selection, entity, None);
            let (columns, sources) = if let Projection::Columns(columns) = projection {
                (
                    Some(columns.iter().map(|c| c.name.clone()).collect()),
                    Some(columns.iter().map(|c| c.source.clone()).collect()),
                )
            } else {
                (None, None)
            };
            (
                ResultShape::Rows {
                    variable: "rows".into(),
                    columns,
                    sources,
                    identity_variable: None,
                },
                format!("properties of {}", describe_selection(&value.selection)),
                "select",
            )
        }
    })
}

pub(super) fn compile_graph(
    batch: &mut Batch,
    value: &GraphStatement,
) -> Result<CompiledStatement, HqlError> {
    if validate_hops(&value.selection)? != EntityKind::Nodes {
        return Err(HqlError::plain("a QUERY must finish on nodes"));
    }
    let node_limit = value.selection.limit.unwrap_or(DEFAULT_GRAPH_NODE_LIMIT);
    let edge_limit = value.max_edges.unwrap_or(DEFAULT_GRAPH_EDGE_LIMIT);
    let input = select(&value.selection, Some(node_limit))?;
    // The edge fanout consumes the exact bounded node selection.
    batch.add("__graph_nodes", input, false);
    let stream = || json!({"inject":{"variable":"__graph_nodes"}});
    batch.entities(
        "nodes",
        stream(),
        EntityKind::Nodes,
        if value.with_properties.is_empty() {
            None
        } else {
            Some(&value.with_properties)
        },
    );
    let edges = wrap(
        "limit",
        wrap(
            "dedup",
            wrap("both_e", stream(), json!({"label": value.edge_label})),
            json!({}),
        ),
        json!({"count": edge_limit}),
    );
    batch.entities("edges", edges, EntityKind::Edges, None);
    Ok((
        ResultShape::Graph {
            node_variable: "nodes".into(),
            edge_variable: "edges".into(),
            node_limit,
            edge_limit,
        },
        format!("graph (≤{node_limit} nodes, ≤{edge_limit} edges)"),
        "graph",
    ))
}

pub(super) fn compile_show(batch: &mut Batch, value: &ShowStatement) -> CompiledStatement {
    let labels = |entity| {
        wrap(
            "group_count",
            wrap("limit", all(entity), json!({"count":value.sample.max(1)})),
            json!({"property":"$label"}),
        )
    };
    if value.target == ShowTarget::Stats {
        batch.add(
            "nodeCount",
            wrap("count", all(EntityKind::Nodes), json!({})),
            true,
        );
        batch.add(
            "edgeCount",
            wrap("count", all(EntityKind::Edges), json!({})),
            true,
        );
        batch.add("nodeLabels", labels(EntityKind::Nodes), true);
        batch.add("edgeLabels", labels(EntityKind::Edges), true);
        (
            ResultShape::Stats {
                node_count: "nodeCount".into(),
                edge_count: "edgeCount".into(),
                node_labels: "nodeLabels".into(),
                edge_labels: "edgeLabels".into(),
            },
            "totals and sampled label counts".into(),
            "stats",
        )
    } else {
        let nodes = value.target != ShowTarget::EdgeLabels;
        let edges = value.target != ShowTarget::NodeLabels;
        if nodes {
            batch.add("nodeLabels", labels(EntityKind::Nodes), true);
        }
        if edges {
            batch.add("edgeLabels", labels(EntityKind::Edges), true);
        }
        (
            ResultShape::Labels {
                nodes: nodes.then(|| "nodeLabels".into()),
                edges: edges.then(|| "edgeLabels".into()),
            },
            "sampled label counts".into(),
            "labels",
        )
    }
}

pub(super) fn compile_describe(batch: &mut Batch, value: &DescribeStatement) -> CompiledStatement {
    batch.add(
        "__entity",
        source(value.entity, json!({"ids":[value.id]})),
        false,
    );
    let stream = || json!({"inject":{"variable":"__entity"}});
    batch.entities("entity", stream(), value.entity, None);
    if value.entity == EntityKind::Nodes {
        let edges = || wrap("both_e", stream(), json!({}));
        batch.add("degree", wrap("count", edges(), json!({})), true);
        batch.entities(
            "edges",
            wrap("limit", edges(), json!({"count":value.limit})),
            EntityKind::Edges,
            None,
        );
        batch.entities(
            "neighbours",
            wrap(
                "limit",
                wrap("dedup", wrap("both", stream(), json!({})), json!({})),
                json!({"count":value.limit}),
            ),
            EntityKind::Nodes,
            None,
        );
        (
            ResultShape::DescribeNode,
            format!("node {} with bounded incident edges", value.id),
            "describe_node",
        )
    } else {
        batch.entities(
            "sourceNode",
            wrap("in_n", stream(), json!({})),
            EntityKind::Nodes,
            None,
        );
        batch.entities(
            "targetNode",
            wrap("out_n", stream(), json!({})),
            EntityKind::Nodes,
            None,
        );
        (
            ResultShape::DescribeEdge,
            format!("edge {} with directed endpoints", value.id),
            "describe_edge",
        )
    }
}
