//! IPC entry points; Rust owns compilation, execution, and decoding.

pub(crate) mod schema;

use crate::connection::{candidate_connection, ConnectionUpdate, ConnectionView};
use crate::error::Result;
use crate::hql::{compile_source_for, CompiledQueryView};
use crate::results::QueryResult;
use crate::state::AppState;
use crate::transport::{compiled_view, execute_compiled};
use serde::Serialize;
use tauri::State;

const PROBE_QUERY: &str = "SELECT COUNT(*) FROM NODES LIMIT 1";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryExecution {
    pub result: QueryResult,
    pub duration_ms: u64,
    pub compiled: CompiledQueryView,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResponse {
    pub duration_ms: u64,
}

/// Compiles HQL for live editor feedback and the wire-format inspector.
#[tauri::command]
pub(crate) fn compile_query(
    state: State<'_, AppState>,
    source: String,
) -> Result<CompiledQueryView> {
    let conn = state.snapshot();
    let compiled = compile_source_for(&source, conn.protocol)?;
    compiled_view(&compiled, &conn)
}

/// Owns the full source-to-result pipeline for one user query.
#[tauri::command]
pub(crate) async fn run_query(
    state: State<'_, AppState>,
    source: String,
) -> Result<QueryExecution> {
    let conn = state.snapshot();
    let compiled = compile_source_for(&source, conn.protocol)?;
    let (result, duration_ms) = execute_compiled(&state.http, &conn, &compiled).await?;
    Ok(QueryExecution {
        result,
        duration_ms,
        compiled: compiled_view(&compiled, &conn)?,
    })
}

/// Runs a trivial query against a candidate connection without saving it, so
/// the settings panel can verify a URL before committing to it.
#[tauri::command]
pub(crate) async fn test_connection(
    state: State<'_, AppState>,
    connection: ConnectionUpdate,
) -> Result<ProbeResponse> {
    let stored = state.snapshot();
    let conn = candidate_connection(connection, &stored)?;
    let compiled = compile_source_for(PROBE_QUERY, conn.protocol)?;
    let (_, duration_ms) = execute_compiled(&state.http, &conn, &compiled).await?;
    Ok(ProbeResponse { duration_ms })
}
#[tauri::command]
pub(crate) fn get_connection(state: State<'_, AppState>) -> ConnectionView {
    ConnectionView::from(&state.snapshot())
}

#[tauri::command]
pub(crate) fn set_connection(
    state: State<'_, AppState>,
    update: ConnectionUpdate,
) -> Result<ConnectionView> {
    state.update_connection(update)
}
