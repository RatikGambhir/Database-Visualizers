use serde::{Deserialize, Serialize};

use crate::domains::schema::models::DatabaseSchema;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInput {
    pub name: String,
    pub kind: String,
    pub url: Option<String>,
    pub path: Option<String>,
    pub read_only: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub detail: String,
    pub connected: bool,
    pub read_only: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub connection: ConnectionProfile,
    pub schema: DatabaseSchema,
}
