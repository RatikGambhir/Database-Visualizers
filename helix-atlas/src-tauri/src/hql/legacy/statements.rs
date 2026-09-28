//! Legacy read statement lowering and result shapes.

use super::predicates::validate_condition;
use super::selection::{named, selection_steps, terminal_for};
use super::CompileParts;
use crate::hql::validation::{describe_selection, validate_hops};
use crate::hql::{
    DescribeStatement, EntityKind, GraphStatement, HqlError, Projection, ResultShape,
    SelectStatement, ShowStatement, ShowTarget, DEFAULT_GRAPH_EDGE_LIMIT, DEFAULT_GRAPH_NODE_LIMIT,
    DEFAULT_ROW_LIMIT,
};
use serde_json::json;

pub(super) fn compile_select(statement: &SelectStatement) -> Result<CompileParts, HqlError> {
    let landing = validate_hops(&statement.selection)?;
    validate_condition(statement.selection.condition.as_ref())?;
    for hop in &statement.selection.hops {
        validate_condition(hop.condition.as_ref())?;
    }

    let description = describe_selection(&statement.selection);
    if matches!(statement.projection, Projection::Count) {
        let terminal = if let Some(group_by) = &statement.group_by {
            json!({ "GroupCount": group_by.source })
        } else {
            json!("Count")
        };
        let mut steps = selection_steps(&statement.selection, None)?;
        steps.push(terminal);
        if let Some(group_by) = &statement.group_by {
            return Ok((
                vec![named("rows", steps)],
                ResultShape::GroupCount {
                    variable: "rows".into(),
                    by: group_by.name.clone(),
                    source: group_by.source.clone(),
                },
                format!("count of {description} grouped by {}", group_by.name),
                "group_count",
            ));
        }
        return Ok((
            vec![named("rows", steps)],
            ResultShape::Count {
                variable: "rows".into(),
            },
            format!("count of {description}"),
            "count",
        ));
    }

    let terminal = terminal_for(landing);
    let mut steps = selection_steps(&statement.selection, Some(DEFAULT_ROW_LIMIT))?;
    steps.push(terminal.clone());
    match &statement.projection {
        Projection::Star => {
            let mut identity = selection_steps(&statement.selection, Some(DEFAULT_ROW_LIMIT))?;
            identity.push(terminal);
            Ok((
                vec![named("rows", steps), named("identity", identity)],
                ResultShape::Rows {
                    variable: "rows".into(),
                    columns: None,
                    sources: None,
                    identity_variable: Some("identity".into()),
                },
                format!("all properties of {description}"),
                "select_star",
            ))
        }
        Projection::Columns(columns) => Ok((
            vec![named("rows", steps)],
            ResultShape::Rows {
                variable: "rows".into(),
                columns: Some(columns.iter().map(|column| column.name.clone()).collect()),
                sources: Some(columns.iter().map(|column| column.source.clone()).collect()),
                identity_variable: None,
            },
            format!(
                "{} column{} of {description}",
                columns.len(),
                if columns.len() == 1 { "" } else { "s" }
            ),
            "select",
        )),
        Projection::Count => unreachable!(),
    }
}

pub(super) fn compile_graph(statement: &GraphStatement) -> Result<CompileParts, HqlError> {
    if validate_hops(&statement.selection)? != EntityKind::Nodes {
        return Err(HqlError::plain("a QUERY must finish on nodes"));
    }
    validate_condition(statement.selection.condition.as_ref())?;
    for hop in &statement.selection.hops {
        validate_condition(hop.condition.as_ref())?;
    }
    let node_limit = statement
        .selection
        .limit
        .unwrap_or(DEFAULT_GRAPH_NODE_LIMIT);
    let edge_limit = statement.max_edges.unwrap_or(DEFAULT_GRAPH_EDGE_LIMIT);
    let mut selection = statement.selection.clone();
    selection.limit = Some(node_limit);
    let mut nodes = selection_steps(&selection, Some(node_limit))?;
    nodes.push(json!({ "ValueMap": null }));
    let mut edges = selection_steps(&selection, Some(node_limit))?;
    edges.push(json!({ "BothE": statement.edge_label }));
    edges.push(json!("Dedup"));
    edges.push(json!({ "Limit": edge_limit }));
    edges.push(json!("EdgeProperties"));
    let property_note = if statement.with_properties.is_empty() {
        String::new()
    } else {
        format!(
            " with {} requested properties",
            statement.with_properties.len()
        )
    };
    Ok((
        vec![named("nodes", nodes), named("edges", edges)],
        ResultShape::Graph {
            node_variable: "nodes".into(),
            edge_variable: "edges".into(),
            node_limit,
            edge_limit,
        },
        format!(
            "graph of {} (≤{node_limit} nodes, ≤{edge_limit} edges){property_note}",
            describe_selection(&statement.selection)
        ),
        "graph",
    ))
}

pub(super) fn compile_show(statement: &ShowStatement) -> CompileParts {
    let sample = statement.sample.max(1);
    let node_labels = || {
        named(
            "nodeLabels",
            vec![
                json!({ "N": "All" }),
                json!({ "Limit": sample }),
                json!({ "GroupCount": "$label" }),
            ],
        )
    };
    let edge_source = || {
        vec![
            json!({ "N": "All" }),
            json!({ "OutE": null }),
            json!("Dedup"),
        ]
    };
    let edge_labels = || {
        let mut steps = edge_source();
        steps.push(json!({ "Limit": sample }));
        steps.push(json!("EdgeProperties"));
        named("edgeLabels", steps)
    };
    if statement.target == ShowTarget::Stats {
        let mut edge_count = edge_source();
        edge_count.push(json!("Count"));
        return (
            vec![
                named("nodeCount", vec![json!({ "N": "All" }), json!("Count")]),
                named("edgeCount", edge_count),
                node_labels(),
                edge_labels(),
            ],
            ResultShape::Stats {
                node_count: "nodeCount".into(),
                edge_count: "edgeCount".into(),
                node_labels: "nodeLabels".into(),
                edge_labels: "edgeLabels".into(),
            },
            format!("instance totals, with labels sampled over {sample} entities"),
            "stats",
        );
    }
    let want_nodes = statement.target != ShowTarget::EdgeLabels;
    let want_edges = statement.target != ShowTarget::NodeLabels;
    let mut queries = Vec::new();
    if want_nodes {
        queries.push(node_labels());
    }
    if want_edges {
        queries.push(edge_labels());
    }
    (
        queries,
        ResultShape::Labels {
            nodes: want_nodes.then(|| "nodeLabels".into()),
            edges: want_edges.then(|| "edgeLabels".into()),
        },
        format!("labels seen across a sample of {sample} entities"),
        "labels",
    )
}

pub(super) fn compile_describe(statement: &DescribeStatement) -> CompileParts {
    let id = statement.id;
    if statement.entity == EntityKind::Edges {
        let edge = || vec![json!({ "E": { "Ids": [id] } })];
        let mut entity = edge();
        entity.push(json!("EdgeProperties"));
        let mut identity = edge();
        identity.push(json!("EdgeProperties"));
        let mut source = edge();
        source.push(json!({ "OutN": null }));
        source.push(json!({ "ValueMap": null }));
        let mut target = edge();
        target.push(json!({ "InN": null }));
        target.push(json!({ "ValueMap": null }));
        return (
            vec![
                named("entity", entity),
                named("identity", identity),
                named("sourceNode", source),
                named("targetNode", target),
            ],
            ResultShape::DescribeEdge,
            format!("edge {id} with its endpoints"),
            "describe_edge",
        );
    }
    let node = || vec![json!({ "N": { "Ids": [id] } })];
    let mut entity = node();
    entity.push(json!({ "ValueMap": null }));
    let mut identity = node();
    identity.push(json!({ "ValueMap": null }));
    let mut edges = node();
    edges.push(json!({ "BothE": null }));
    let mut degree = edges.clone();
    degree.push(json!("Count"));
    edges.push(json!({ "Limit": statement.limit }));
    edges.push(json!("EdgeProperties"));
    let mut neighbours = node();
    neighbours.push(json!({ "Both": null }));
    neighbours.push(json!("Dedup"));
    neighbours.push(json!({ "Limit": statement.limit }));
    neighbours.push(json!({ "ValueMap": null }));
    (
        vec![
            named("entity", entity),
            named("identity", identity),
            named("edges", edges),
            named("neighbours", neighbours),
            named("degree", degree),
        ],
        ResultShape::DescribeNode,
        format!("node {id} with up to {} incident edges", statement.limit),
        "describe_node",
    )
}
