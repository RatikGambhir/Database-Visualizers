//! Mutation syntax and a validated, ordered plan. No write adapter is enabled
//! until the pinned server passes the atomicity/cardinality conformance gates.
use super::parameters::{ParameterRequirement, Resolver};
use super::*;
#[cfg(test)]
mod tests;
mod validation;

pub(super) const MAX_SOURCE_BYTES: usize = 1_048_576;
pub(super) const MAX_STATEMENTS: usize = 100;
pub(super) const MAX_ROWS: usize = 1_000;

pub(super) enum Input {
    Read(Box<Statement>),
    Mutation(ParsedMutation),
}
#[derive(Debug)]
pub(super) struct ParsedMutation {
    pub block: bool,
    pub statements: Vec<ParsedStep>,
}
#[derive(Debug)]
pub(super) enum ParsedStep {
    Insert(ParsedInsert),
    Lookup {
        selection: Box<Selection>,
        binding: String,
        span: Span,
    },
}
#[derive(Debug)]
pub(super) struct ParsedInsert {
    pub entity: EntityKind,
    pub label: String,
    pub binding: Option<String>,
    pub columns: Vec<ColumnRef>,
    pub rows: Vec<Vec<ParsedValue>>,
    pub returning: Option<Projection>,
    pub span: Span,
}
#[derive(Debug)]
pub(super) struct ParsedValue {
    pub value: ValueExpression,
    pub span: Span,
}
#[derive(Debug)]
pub(super) enum ValueExpression {
    Literal(Literal),
    Binding(String),
}

/// Validated endpoint: an exact identity or an earlier single-node statement.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum NodeReference {
    Id(String),
    Binding(usize),
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedRow {
    pub source: Option<NodeReference>,
    pub target: Option<NodeReference>,
    pub properties: std::collections::BTreeMap<String, ParameterValue>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReturningColumn {
    pub name: String,
    pub source: String,
    pub virtual_column: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", content = "columns", rename_all = "camelCase")]
pub enum Returning {
    Entities,
    Columns(Vec<ReturningColumn>),
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PlannedStatement {
    #[serde(rename_all = "camelCase")]
    Lookup {
        statement_index: usize,
        binding: String,
        /// Read operation tree without read pagination. Not an executable write entry.
        selection_json: String,
        required_cardinality: usize,
        span: Span,
    },
    #[serde(rename_all = "camelCase")]
    Insert {
        statement_index: usize,
        entity: &'static str,
        label: String,
        binding: Option<String>,
        rows: Vec<PlannedRow>,
        returning: Option<Returning>,
        span: Span,
    },
}
/// Side-effect-free preview. Counts are planned, never a commit receipt.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationPreview {
    pub planned_nodes: usize,
    pub planned_edges: usize,
    pub statements: Vec<PlannedStatement>,
    pub parameters: Vec<ParameterRequirement>,
    pub executable: bool,
    pub blocked_reason: String,
}

pub(super) fn error(
    code: &'static str,
    message: impl Into<String>,
    span: Option<Span>,
) -> HqlError {
    let mut error = HqlError::new(message, span, None);
    error.code = Some(code);
    error
}

pub(super) fn compile(
    parsed: ParsedMutation,
    protocol: Protocol,
    resolver: &mut Resolver<'_>,
) -> Result<CompiledQuery, HqlError> {
    let mut preview = validation::validate(parsed, resolver)?;
    if serde_json::to_vec(&preview)
        .map_err(|e| HqlError::plain(e.to_string()))?
        .len()
        > 2 * MAX_SOURCE_BYTES
    {
        return Err(error(
            "mutation_limit",
            "mutation preview exceeds the 2 MiB limit",
            None,
        ));
    }
    if protocol == Protocol::V2 {
        preview.executable = true;
        return super::v2::compile_mutation(preview);
    }
    preview.blocked_reason = match protocol {
        Protocol::LegacyV1 => "legacy v1 connections are read-only; mutation execution requires a verified v2 write adapter",
        Protocol::V2 => "mutation execution is unavailable: the pinned v2 contract has not passed transactional exact-one lookup, missing-source rollback, and mutation ID/receipt conformance gates",
    }.to_owned();
    Ok(CompiledQuery {
        protocol,
        returns: Vec::new(),
        projections: Vec::new(),
        // Do not present a logical plan as a valid wire request.
        transport_json: String::new(),
        summary: format!(
            "Planned: {} nodes, {} edges in {} statements · execution unavailable",
            preview.planned_nodes,
            preview.planned_edges,
            preview.statements.len()
        ),
        shape: ResultShape::UnavailableMutation,
        mutation: Some(preview),
    })
}
