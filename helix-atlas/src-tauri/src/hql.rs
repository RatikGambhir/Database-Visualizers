//! HelixSQL lexer, parser, validator, and versioned HelixDB read compilers.
//!
//! This module is the authoritative language implementation. The webview sends
//! source text across IPC and receives only a compiled preview or an executed
//! result; no AST or traversal-building logic lives in React.

use serde::{Deserialize, Serialize};

mod legacy;
mod lexer;
mod parser;
mod plan;
#[cfg(test)]
mod tests;
mod v2;
mod validation;

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
    pub span: Option<Span>,
    pub hint: Option<String>,
}

impl HqlError {
    fn new(message: impl Into<String>, span: Option<Span>, hint: Option<&str>) -> Self {
        Self {
            message: message.into(),
            span,
            hint: hint.map(str::to_owned),
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
    let statement = Parser::new(source)?.parse()?;
    validate_numbers(&statement, protocol)?;
    match protocol {
        Protocol::LegacyV1 => legacy::compile_statement(&statement),
        Protocol::V2 => v2::compile(&statement),
    }
}
