//! Operation-tree lowering pinned to contracts/helixdb-v2/openapi.json and the matching
//! official AST revision. This adapter never consumes the legacy flat JSON.
use super::*;

mod batch;
mod mutations;
mod predicates;
mod selection;
mod statements;
pub(super) use mutations::compile as compile_mutation;
pub(crate) use mutations::row_name;
#[cfg(test)]
mod tests;

use batch::Batch;

type CompiledStatement = (ResultShape, String, &'static str);

pub(super) fn compile(statement: &Statement) -> Result<CompiledQuery, HqlError> {
    let mut batch = Batch::default();
    let (shape, summary, kind) = match statement {
        Statement::Select(value) => statements::compile_select(&mut batch, value)?,
        Statement::Graph(value) => statements::compile_graph(&mut batch, value)?,
        Statement::Show(value) => statements::compile_show(&mut batch, value),
        Statement::Describe(value) => statements::compile_describe(&mut batch, value),
    };
    let request = json!({"request_type":"read", "query_name":format!("helix_visualizer_{kind}"), "query":{"read":{"entries":batch.entries,"returns":batch.returns}}});
    Ok(CompiledQuery {
        protocol: Protocol::V2,
        returns: batch.returns,
        projections: batch.projections,
        transport_json: serde_json::to_string_pretty(&request)
            .map_err(|e| HqlError::plain(e.to_string()))?,
        summary,
        shape,
        mutation: None,
    })
}

/// Validate and preview an uncapped lookup without inventing a write assertion.
pub(super) fn mutation_selection(selection: &Selection) -> Result<Value, HqlError> {
    selection::select(selection, None)
}
