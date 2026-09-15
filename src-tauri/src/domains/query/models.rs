use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryRequest {
    pub connection_id: String,
    pub sql: String,
    pub limit: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Map<String, Value>>,
    pub affected_rows: u64,
    pub duration_ms: f64,
    pub truncated: bool,
    pub message: String,
}
