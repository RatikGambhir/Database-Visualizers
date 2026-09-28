//! HTTP request construction and compiled query execution.

use crate::connection::{query_endpoint, Connection, Deployment};
use crate::error::{AppError, Result};
use crate::hql::{CompiledQuery, CompiledQueryView};
use crate::results::{decode_compiled_response, QueryResult};
use std::time::{Duration, Instant};

/// Raw response retained only inside the Rust process.
#[derive(Debug)]
pub(crate) struct QueryResponse {
    pub(crate) status: u16,
    pub(crate) body: String,
    pub(crate) duration_ms: u64,
}
pub(crate) fn compiled_view(
    compiled: &CompiledQuery,
    conn: &Connection,
) -> Result<CompiledQueryView> {
    let mut view = CompiledQueryView::from(compiled);
    view.endpoint = query_endpoint(&conn.url, conn.protocol)?.to_string();
    view.connection_revision = conn.revision;
    Ok(view)
}

fn describe_request_error(err: &reqwest::Error) -> String {
    // reqwest nests the interesting cause (connection refused, DNS failure),
    // and the outer Display is usually just "error sending request".
    let mut source: Option<&(dyn std::error::Error + 'static)> = std::error::Error::source(err);
    let mut deepest = err.to_string();
    while let Some(cause) = source {
        deepest = cause.to_string();
        source = cause.source();
    }
    deepest
}

pub(crate) fn query_request(
    http: &reqwest::Client,
    conn: &Connection,
    body: String,
) -> Result<reqwest::RequestBuilder> {
    let endpoint = query_endpoint(&conn.url, conn.protocol)?;
    let timeout_ms = conn.timeout_ms.clamp(1_000, 600_000);

    let mut request = http
        .post(endpoint)
        .timeout(Duration::from_millis(timeout_ms))
        .header("content-type", "application/json")
        .body(body);
    if let Some(key) = conn.api_key.as_deref().filter(|k| !k.is_empty()) {
        request = request.header("Authorization", format!("Bearer {key}"));
    }
    if conn.writer_only {
        request = request.header("x-helix-require-writer", "true");
    }

    if conn.deployment == Deployment::SharedCloud {
        request = request.header(
            "X-Helix-Database-Id",
            conn.database_id.as_deref().unwrap_or_default(),
        );
    }

    Ok(request)
}

pub(crate) async fn post_query(
    http: &reqwest::Client,
    conn: &Connection,
    body: String,
) -> Result<QueryResponse> {
    let request = query_request(http, conn, body)?;
    let timeout_ms = conn.timeout_ms.clamp(1_000, 600_000);
    let started = Instant::now();
    let response = request.send().await.map_err(|e| {
        if e.is_timeout() {
            AppError::Timeout(timeout_ms)
        } else {
            AppError::Unreachable {
                url: conn.url.clone(),
                reason: describe_request_error(&e),
            }
        }
    })?;

    let status = response.status().as_u16();
    let text = response.text().await.map_err(|e| AppError::Unreachable {
        url: conn.url.clone(),
        reason: describe_request_error(&e),
    })?;

    Ok(QueryResponse {
        status,
        body: text,
        duration_ms: started.elapsed().as_millis() as u64,
    })
}

pub(crate) fn require_success(response: QueryResponse) -> Result<QueryResponse> {
    if response.status == 200 {
        return Ok(response);
    }
    let error: Option<serde_json::Value> = serde_json::from_str(&response.body).ok();
    let code = error
        .as_ref()
        .and_then(|value| value.get("error"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_owned);
    let diagnostic = error
        .as_ref()
        .and_then(|value| value.get("msg"))
        .and_then(serde_json::Value::as_str)
        .map(|message| format!(": {message}"))
        .unwrap_or_default();
    Err(AppError::HttpStatus {
        code,
        diagnostic,
        status: response.status,
        detail: (!response.body.trim().is_empty()).then(|| response.body.trim().to_owned()),
    })
}

pub(crate) async fn execute_compiled(
    http: &reqwest::Client,
    connection: &Connection,
    compiled: &CompiledQuery,
) -> Result<(QueryResult, u64)> {
    let response =
        require_success(post_query(http, connection, compiled.transport_json.clone()).await?)?;
    let result = decode_compiled_response(&response.body, compiled)?;
    Ok((result, response.duration_ms))
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod http_tests;
