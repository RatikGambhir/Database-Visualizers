//! Stable UI-facing result contracts.

use super::json::preview;
use serde::Serialize;
use serde_json::{Map, Value};

pub type Row = Map<String, Value>;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphNodeData {
    pub id: String,
    pub label: Option<String>,
    pub properties: Row,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdgeData {
    pub id: String,
    pub label: Option<String>,
    pub source: String,
    pub target: String,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GraphData {
    pub nodes: Vec<GraphNodeData>,
    pub edges: Vec<GraphEdgeData>,
    pub dangling_edges: usize,
    pub truncated_nodes: bool,
    pub truncated_edges: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LabelCount {
    pub label: String,
    pub count: u64,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum QueryResult {
    Mutation {
        inserted_nodes: usize,
        inserted_edges: usize,
        statements: Vec<MutationStatementResult>,
        outcome: &'static str,
        durability: &'static str,
    },
    Rows {
        columns: Vec<String>,
        rows: Vec<Row>,
    },
    Count {
        value: u64,
    },
    GroupCount {
        by: String,
        groups: Vec<LabelCount>,
    },
    Graph {
        graph: GraphData,
    },
    Labels {
        nodes: Option<Vec<LabelCount>>,
        edges: Option<Vec<LabelCount>>,
    },
    Stats {
        node_count: u64,
        edge_count: u64,
        node_labels: Vec<LabelCount>,
        edge_labels: Vec<LabelCount>,
    },
    Describe {
        #[serde(flatten)]
        data: Box<DescribeResult>,
    },
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DescribeResult {
    pub entity: &'static str,
    pub id: Option<String>,
    pub label: Option<String>,
    pub properties: Row,
    pub edges: Vec<GraphEdgeData>,
    pub neighbours: Vec<GraphNodeData>,
    pub degree: Option<u64>,
    pub endpoints: Option<Endpoints>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Endpoints {
    pub source: Option<GraphNodeData>,
    pub target: Option<GraphNodeData>,
}

#[derive(Clone, Debug, thiserror::Error)]
#[error("{message}")]
pub struct ResultError {
    pub message: String,
    pub detail: Option<String>,
}

impl ResultError {
    pub(super) fn new(message: impl Into<String>, body: &Value) -> Self {
        Self {
            message: message.into(),
            detail: Some(preview(body)),
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MutationEntity {
    pub id: String,
    pub label: Option<String>,
    pub source: Option<String>,
    pub target: Option<String>,
    pub properties: Row,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MutationStatementResult {
    pub statement_index: usize,
    pub kind: String,
    pub binding: Option<String>,
    pub ids: Vec<String>,
    pub columns: Vec<String>,
    pub identity_columns: std::collections::BTreeMap<String, &'static str>,
    pub rows: Vec<Row>,
    pub entities: Vec<MutationEntity>,
}
