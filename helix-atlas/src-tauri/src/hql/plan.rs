//! Shared logical read plan consumed independently by each protocol adapter.
use super::*;
#[derive(Clone, Debug)]
pub(super) enum Literal {
    String(String),
    Integer(String),
    Float(f64),
    Boolean(bool),
    Null,
}

#[derive(Clone, Debug)]
pub(super) struct ColumnRef {
    pub(super) name: String,
    pub(super) source: String,
    pub(super) virtual_column: bool,
    pub(super) span: Span,
}

#[derive(Clone, Copy, Debug)]
pub(super) enum ComparisonOperator {
    Eq,
    Neq,
    Gt,
    Gte,
    Lt,
    Lte,
}

#[derive(Clone, Debug)]
pub(super) enum Condition {
    And(Vec<Condition>),
    Or(Vec<Condition>),
    Not(Box<Condition>),
    Compare {
        column: ColumnRef,
        operator: ComparisonOperator,
        value: Literal,
    },
    Between {
        column: ColumnRef,
        low: Literal,
        high: Literal,
    },
    In {
        column: ColumnRef,
        values: Vec<Literal>,
        negated: bool,
    },
    Like {
        column: ColumnRef,
        pattern: String,
        negated: bool,
    },
    IsNull {
        column: ColumnRef,
        negated: bool,
    },
    Has(ColumnRef),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum EntityKind {
    Nodes,
    Edges,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum HopDirection {
    Out,
    In,
    Both,
    OutE,
    InE,
    BothE,
    FromNode,
    ToNode,
    OtherNode,
}

#[derive(Clone, Debug)]
pub(super) struct Hop {
    pub(super) direction: HopDirection,
    pub(super) label: Option<String>,
    pub(super) condition: Option<Condition>,
    pub(super) span: Span,
}

#[derive(Clone, Debug)]
pub(super) struct Source {
    pub(super) entity: EntityKind,
    pub(super) label: Option<String>,
    pub(super) span: Span,
}

#[derive(Clone, Debug)]
pub(super) enum Projection {
    Star,
    Columns(Vec<ColumnRef>),
    Count,
}

#[derive(Clone, Debug)]
pub(super) struct OrderTerm {
    pub(super) column: ColumnRef,
    pub(super) descending: bool,
}

#[derive(Clone, Debug)]
pub(super) struct Selection {
    pub(super) source: Source,
    pub(super) condition: Option<Condition>,
    pub(super) hops: Vec<Hop>,
    pub(super) order_by: Vec<OrderTerm>,
    pub(super) skip: Option<u64>,
    pub(super) limit: Option<u64>,
    pub(super) distinct: bool,
}

#[derive(Clone, Debug)]
pub(super) struct SelectStatement {
    pub(super) projection: Projection,
    pub(super) group_by: Option<ColumnRef>,
    pub(super) selection: Selection,
}

#[derive(Clone, Debug)]
pub(super) struct GraphStatement {
    pub(super) selection: Selection,
    pub(super) with_properties: Vec<String>,
    pub(super) edge_label: Option<String>,
    pub(super) max_edges: Option<u64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum ShowTarget {
    Labels,
    NodeLabels,
    EdgeLabels,
    Stats,
}

#[derive(Clone, Debug)]
pub(super) struct ShowStatement {
    pub(super) target: ShowTarget,
    pub(super) sample: u64,
}

#[derive(Clone, Debug)]
pub(super) struct DescribeStatement {
    pub(super) entity: EntityKind,
    pub(super) id: u64,
    pub(super) id_span: Span,
    pub(super) limit: u64,
}

#[derive(Clone, Debug)]
pub(super) enum Statement {
    Select(SelectStatement),
    Graph(GraphStatement),
    Show(ShowStatement),
    Describe(DescribeStatement),
}

#[derive(Clone, Debug)]
pub enum ResultShape {
    Rows {
        variable: String,
        columns: Option<Vec<String>>,
        #[allow(dead_code)]
        sources: Option<Vec<String>>,
        identity_variable: Option<String>,
    },
    Count {
        variable: String,
    },
    GroupCount {
        variable: String,
        by: String,
        source: String,
    },
    Graph {
        node_variable: String,
        edge_variable: String,
        node_limit: u64,
        edge_limit: u64,
    },
    Labels {
        nodes: Option<String>,
        edges: Option<String>,
    },
    Stats {
        node_count: String,
        edge_count: String,
        node_labels: String,
        edge_labels: String,
    },
    DescribeNode,
    DescribeEdge,
}

/// Missing saved settings deliberately retain the original adapter.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Protocol {
    #[default]
    LegacyV1,
    V2,
}
impl Protocol {
    pub fn version(self) -> &'static str {
        match self {
            Self::LegacyV1 => "v1",
            Self::V2 => "v2",
        }
    }
    pub fn path(self) -> &'static str {
        match self {
            Self::LegacyV1 => "/v1/query",
            Self::V2 => "/v2/query",
        }
    }
}

/// A projection of one bound stream. Every projection reads the same ordered
/// rows, rather than independently evaluating the entity selection.
#[derive(Clone, Debug)]
pub struct BoundProjection {
    pub variable: String,
    pub ids: String,
    pub labels: String,
    pub endpoints: Option<(String, String)>,
}

#[derive(Clone, Debug)]
pub struct CompiledQuery {
    pub protocol: Protocol,
    pub returns: Vec<String>,
    pub projections: Vec<BoundProjection>,
    pub transport_json: String,
    pub summary: String,
    pub shape: ResultShape,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompiledQueryView {
    pub protocol: Protocol,
    pub execution_kind: &'static str,
    pub endpoint_path: &'static str,
    pub endpoint: String,
    pub connection_revision: u64,
    pub transport_json: String,
    pub summary: String,
}

impl From<&CompiledQuery> for CompiledQueryView {
    fn from(value: &CompiledQuery) -> Self {
        Self {
            protocol: value.protocol,
            execution_kind: "read",
            endpoint_path: value.protocol.path(),
            endpoint: value.protocol.path().to_owned(),
            connection_revision: 0,
            transport_json: value.transport_json.clone(),
            summary: value.summary.clone(),
        }
    }
}
