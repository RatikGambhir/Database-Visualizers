//! Legacy v1 flat traversal adapter; retained explicitly for saved connections.
use super::*;

mod predicates;
mod selection;
mod statements;

pub(super) use predicates::{predicate, single_property};
use statements::{compile_describe, compile_graph, compile_select, compile_show};

pub(super) fn compile_statement(statement: &Statement) -> Result<CompiledQuery, HqlError> {
    let (queries, shape, summary, kind) = match statement {
        Statement::Select(statement) => compile_select(statement)?,
        Statement::Graph(statement) => compile_graph(statement)?,
        Statement::Show(statement) => compile_show(statement),
        Statement::Describe(statement) => compile_describe(statement),
    };
    let returns = queries
        .iter()
        .filter_map(|query| query.pointer("/Query/name").and_then(Value::as_str))
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let request = json!({
        "request_type": "read",
        "query_name": format!("helix_visualizer_{kind}"),
        "query": { "queries": queries, "returns": returns },
        "parameters": {},
    });
    Ok(CompiledQuery {
        protocol: Protocol::LegacyV1,
        returns,
        projections: Vec::new(),
        transport_json: serde_json::to_string_pretty(&request)
            .map_err(|error| HqlError::plain(error.to_string()))?,
        summary,
        shape,
    })
}

type CompileParts = (Vec<Value>, ResultShape, String, &'static str);
