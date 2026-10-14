//! HelixSQL lexer, parser, validator, and versioned HelixDB read compilers.
//!
//! This module is the authoritative language implementation. The webview sends
//! source text across IPC and receives only a compiled preview or an executed
//! result; no AST or traversal-building logic lives in React.

use serde::{Deserialize, Serialize};

mod legacy;
mod lexer;
mod mutation;
mod parameters;
mod parser;
mod plan;
#[cfg(test)]
mod tests;
mod v2;
mod validation;
pub use mutation::{MutationPreview, PlannedStatement, Returning};
pub use parameters::{ParameterValue, Parameters};
pub(crate) use v2::row_name as mutation_row_name;

pub(crate) use parser::is_keyword_word;
use parser::Parser;
use plan::*;
pub use plan::{CompiledQuery, CompiledQueryView, Protocol, ResultShape};
use serde_json::{json, Value};
use validation::*;

pub const DEFAULT_ROW_LIMIT: u64 = 500;
pub const DEFAULT_GRAPH_NODE_LIMIT: u64 = 400;
pub const DEFAULT_GRAPH_EDGE_LIMIT: u64 = 2_000;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub start: usize,
    pub end: usize,
    pub line: usize,
    pub column: usize,
}

#[derive(Clone, Debug, Serialize, thiserror::Error)]
#[error("{message}")]
#[serde(rename_all = "camelCase")]
pub struct HqlError {
    pub message: String,
    pub span: Option<Box<Span>>,
    pub hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub statement_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tuple_index: Option<usize>,
}

impl HqlError {
    fn new(message: impl Into<String>, span: Option<Span>, hint: Option<&str>) -> Self {
        Self {
            message: message.into(),
            span: span.map(Box::new),
            hint: hint.map(str::to_owned),
            code: None,
            statement_index: None,
            tuple_index: None,
        }
    }

    fn plain(message: impl Into<String>) -> Self {
        Self::new(message, None, None)
    }
}

#[cfg(test)]
pub fn compile_source(source: &str) -> Result<CompiledQuery, HqlError> {
    compile_source_for(source, Protocol::LegacyV1)
}

pub fn compile_source_for(source: &str, protocol: Protocol) -> Result<CompiledQuery, HqlError> {
    compile_source_with_parameters(source, protocol, &Parameters::new())
}

pub fn compile_source_with_parameters(
    source: &str,
    protocol: Protocol,
    parameters: &Parameters,
) -> Result<CompiledQuery, HqlError> {
    if source.len() > mutation::MAX_SOURCE_BYTES {
        return Err(mutation::error(
            "mutation_limit",
            "query source exceeds the 1 MiB limit",
            None,
        ));
    }
    if serde_json::to_vec(parameters)
        .map_err(|e| HqlError::plain(e.to_string()))?
        .len()
        > mutation::MAX_SOURCE_BYTES
    {
        return Err(mutation::error(
            "mutation_limit",
            "parameters exceed the 1 MiB limit",
            None,
        ));
    }
    let input = Parser::new(source)?.parse_input()?;
    let mut resolver = parameters::Resolver::new(parameters);
    let mut statement = match input {
        mutation::Input::Read(statement) => *statement,
        mutation::Input::Mutation(mutation) => {
            return mutation::compile(mutation, protocol, &mut resolver)
        }
    };
    resolver.read(&mut statement)?;
    resolver.finish()?;
    validate_numbers(&statement, protocol)?;
    match protocol {
        Protocol::LegacyV1 => legacy::compile_statement(&statement),
        Protocol::V2 => v2::compile(&statement),
    }
}

/// Fail locally before constructing an HTTP request; a read probe never enables writes.
pub(crate) fn mutation_execution_error(preview: &MutationPreview) -> HqlError {
    mutation::error(
        "unsupported_mutation_protocol",
        preview.blocked_reason.clone(),
        None,
    )
}

pub(crate) fn unsupported_mutation_server() -> HqlError {
    mutation::error("unsupported_mutation_protocol", "no write was submitted: this server does not advertise the verified atlas-mutation-v1 contract on the pinned build; install the documented server extension", None)
}
