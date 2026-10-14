//! One explicit write, no redirects/retries, and conservative post-submit outcomes.
use super::*;
use crate::hql::Protocol;
use serde_json::Value;

const CONTRACT: &str = "atlas-mutation-v1";
const COMMIT: &str = "c72e64f0c7e480f3d125f071659d5e3ad7b8da15";
const MAX_RESPONSE: usize = 8 * 1024 * 1024;

pub(super) async fn execute(
    connection: &Connection,
    compiled: &CompiledQuery,
) -> Result<(QueryResult, u64)> {
    let preview = compiled
        .mutation
        .as_ref()
        .ok_or_else(|| AppError::Io("missing mutation plan".into()))?;
    if connection.protocol != Protocol::V2 || !preview.executable {
        return Err(crate::hql::mutation_execution_error(preview).into());
    }
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .build()
        .map_err(|e| AppError::Io(e.to_string()))?;
    verify_capability(&http, connection).await?;
    let started = Instant::now();
    let request = query_request(&http, connection, compiled.transport_json.clone())?
        .header("x-helix-require-writer", "true")
        // Success means acknowledged commit. We make no durable-storage claim.
        .header("x-helix-await-durable", "false");
    let mut response = request.send().await.map_err(|e| outcome("unknown", format!("mutation outcome is unknown: {}. Do not retry the insert without checking the database", describe_request_error(&e)), None))?;
    let committed = response.status() == reqwest::StatusCode::OK;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| {
        outcome(
            if committed {
                "committedWithResultError"
            } else {
                "unknown"
            },
            format!("could not read mutation response: {e}; do not retry the insert"),
            None,
        )
    })? {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE {
            return Err(outcome(
                if committed {
                    "committedWithResultError"
                } else {
                    "unknown"
                },
                "mutation response exceeded 8 MiB; do not retry the insert".into(),
                None,
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(bytes).map_err(|_| {
        outcome(
            if committed {
                "committedWithResultError"
            } else {
                "unknown"
            },
            "mutation returned invalid UTF-8; do not retry the insert".into(),
            None,
        )
    })?;
    if !committed {
        return Err(server_failure(&body));
    }
    let result = decode_compiled_response(&body, compiled).map_err(|e| outcome("committedWithResultError", format!("mutation committed, but its returned data could not be decoded: {e}. Do not retry the insert"), None))?;
    Ok((
        result,
        started.elapsed().as_millis().try_into().unwrap_or(u64::MAX),
    ))
}

async fn verify_capability(http: &reqwest::Client, connection: &Connection) -> Result<()> {
    let mut endpoint = query_endpoint(&connection.url, connection.protocol)?;
    let path = endpoint
        .path()
        .strip_suffix("/query")
        .ok_or_else(|| AppError::Io("invalid capability endpoint".into()))?;
    endpoint.set_path(&format!("{path}/mutation-capabilities"));
    let mut request = http.get(endpoint).timeout(Duration::from_millis(
        connection.timeout_ms.clamp(1_000, 600_000),
    ));
    if let Some(key) = connection.api_key.as_deref().filter(|key| !key.is_empty()) {
        request = request.bearer_auth(key);
    }
    if connection.deployment == Deployment::SharedCloud {
        request = request.header(
            "X-Helix-Database-Id",
            connection.database_id.as_deref().unwrap_or_default(),
        );
    }
    let failure = || AppError::Hql(crate::hql::unsupported_mutation_server());
    let mut response = request.send().await.map_err(|_| failure())?;
    if response.status() != reqwest::StatusCode::OK {
        return Err(failure());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| failure())? {
        if body.len().saturating_add(chunk.len()) > 4096 {
            return Err(failure());
        }
        body.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&body).map_err(|_| failure())?;
    if value["contract"] != CONTRACT
        || value["upstream_commit"] != COMMIT
        || value["mode"] != "writer"
        || value["ready"] != true
    {
        return Err(failure());
    }
    Ok(())
}

fn outcome(state: &'static str, message: String, detail: Option<String>) -> AppError {
    AppError::Mutation {
        outcome: state,
        message,
        detail,
        statement_index: None,
        tuple_index: None,
    }
}

fn server_failure(body: &str) -> AppError {
    let value: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let code = value["error"].as_str().unwrap_or("");
    let message = value["msg"]
        .as_str()
        .unwrap_or("unrecognized server response");
    // Only pinned, verified failure contracts establish rollback. A generic 500,
    // proxy error or durability/serialization failure does not.
    let rolled_back = (code == "invalid_query" && message.contains("atlas_single_node:"))
        || matches!(code, "transaction_conflict" | "node_not_found");
    let mut error = outcome(
        if rolled_back { "rolledBack" } else { "unknown" },
        if rolled_back {
            format!("mutation rolled back: {message}")
        } else {
            format!("mutation outcome is unknown: {message}. Do not retry the insert without checking the database")
        },
        Some(body.chars().take(4096).collect()),
    );
    if let AppError::Mutation {
        statement_index,
        tuple_index,
        ..
    } = &mut error
    {
        if let Some(rest) = message.split("__s").nth(1) {
            if let Some((statement, row)) = rest.split_once("_r") {
                *statement_index = statement.parse().ok();
                *tuple_index = row.split('_').next().and_then(|v| v.parse().ok());
            }
        }
    }
    error
}
