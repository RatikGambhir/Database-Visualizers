//! Connection settings, endpoint validation, and credential reuse.

use crate::error::{AppError, Result};
use crate::hql::Protocol;
use serde::{Deserialize, Serialize};

const DEFAULT_URL: &str = "http://localhost:6969";
const DEFAULT_TIMEOUT_MS: u64 = 30_000;

/// Gateway header selection is explicit; URLs do not imply Cloud capabilities.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Deployment {
    #[default]
    Local,
    DatabaseCloud,
    SharedCloud,
}

/// Everything needed to reach one Helix instance.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub url: String,
    #[serde(default)]
    pub protocol: Protocol,
    #[serde(default)]
    pub deployment: Deployment,
    #[serde(default)]
    pub database_id: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    /// Rejects execution on a non-writer; it does not force writer routing.
    #[serde(default)]
    pub writer_only: bool,
    #[serde(skip)]
    pub revision: u64,
}

fn default_timeout() -> u64 {
    DEFAULT_TIMEOUT_MS
}

impl Default for Connection {
    fn default() -> Self {
        Self {
            url: DEFAULT_URL.to_string(),
            protocol: Protocol::V2,
            deployment: Deployment::Local,
            database_id: None,
            revision: 0,
            api_key: None,
            timeout_ms: DEFAULT_TIMEOUT_MS,
            writer_only: false,
        }
    }
}

/// The connection as the frontend is allowed to see it — the key itself never
/// crosses back over the IPC boundary, only whether one is set.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionView {
    pub url: String,
    pub protocol: Protocol,
    pub deployment: Deployment,
    pub database_id: Option<String>,
    pub revision: u64,
    pub endpoint: String,
    pub has_api_key: bool,
    pub timeout_ms: u64,
    pub writer_only: bool,
}

impl From<&Connection> for ConnectionView {
    fn from(c: &Connection) -> Self {
        Self {
            url: c.url.clone(),
            protocol: c.protocol,
            deployment: c.deployment,
            database_id: c.database_id.clone(),
            revision: c.revision,
            endpoint: query_endpoint(&c.url, c.protocol)
                .map(|url| url.to_string())
                .unwrap_or_else(|_| c.url.clone()),
            has_api_key: c.api_key.as_deref().is_some_and(|k| !k.is_empty()),
            timeout_ms: c.timeout_ms,
            writer_only: c.writer_only,
        }
    }
}

/// What the frontend sends when saving settings. `api_key` is tri-state:
/// `None` keeps the stored key for the same endpoint, `Some("")` clears it,
/// and `Some(k)` replaces it.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionUpdate {
    pub url: String,
    pub protocol: Protocol,
    #[serde(default)]
    pub deployment: Deployment,
    #[serde(default)]
    pub database_id: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    #[serde(default)]
    pub writer_only: bool,
}
/// Joins the query path onto the configured base URL, tolerating a trailing
/// slash or an inherited path prefix (`https://gateway/helix` -> `.../helix/v1/query`).
pub(crate) fn query_endpoint(base: &str, protocol: Protocol) -> Result<reqwest::Url> {
    let trimmed = base.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidUrl {
            url: base.to_string(),
            reason: "the URL is empty".into(),
        });
    }
    // A bare `localhost:6969` is what people type; assume plain HTTP for it.
    let normalized = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };

    let mut url = reqwest::Url::parse(&normalized).map_err(|e| AppError::InvalidUrl {
        url: base.to_string(),
        reason: e.to_string(),
    })?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::InvalidUrl {
            url: base.to_string(),
            reason: format!(
                "unsupported scheme {:?}, expected http or https",
                url.scheme()
            ),
        });
    }
    let path = url.path().trim_end_matches('/').to_owned();
    let explicit = if path.ends_with("/v1/query") {
        Some(Protocol::LegacyV1)
    } else if path.ends_with("/v2/query") {
        Some(Protocol::V2)
    } else {
        None
    };
    if let Some(version) = explicit {
        if version != protocol {
            return Err(AppError::InvalidUrl {
                url: base.to_owned(),
                reason: format!(
                    "endpoint uses {} but the selected protocol is {}; change the protocol or URL",
                    version.path(),
                    protocol.path()
                ),
            });
        }
        // Canonicalize a full endpoint's trailing slash for credential comparison.
        url.set_path(&path);
    } else {
        url.path_segments_mut()
            .map_err(|_| AppError::InvalidUrl {
                url: base.to_owned(),
                reason: "the URL cannot have a path".into(),
            })?
            .pop_if_empty()
            .extend([protocol.version(), "query"]);
    }
    Ok(url)
}

/// Resolves the tri-state `api_key` of a [`ConnectionUpdate`] against the key
/// already on file. An omitted key is reused only for the same effective query
/// endpoint; changing hosts or gateway paths must never forward an old secret.
fn resolve_api_key(
    update: Option<String>,
    stored: Option<String>,
    same_endpoint: bool,
) -> Option<String> {
    match update {
        None if same_endpoint => stored.filter(|k| !k.is_empty()),
        None => None,
        Some(key) if key.is_empty() => None,
        Some(key) => Some(key),
    }
}

#[cfg(test)]
fn is_same_endpoint(left: &str, right: &str) -> bool {
    match (
        query_endpoint(left, Protocol::LegacyV1),
        query_endpoint(right, Protocol::LegacyV1),
    ) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

pub(crate) fn candidate_connection(
    update: ConnectionUpdate,
    stored: &Connection,
) -> Result<Connection> {
    let endpoint = query_endpoint(&update.url, update.protocol)?;
    let database_id = update.database_id.filter(|id| !id.trim().is_empty());
    if update.deployment == Deployment::SharedCloud {
        if update.protocol != Protocol::V2 || database_id.is_none() {
            return Err(AppError::InvalidUrl {
                url: update.url,
                reason: "Shared Cloud requires v2 and a database ID from the dashboard".into(),
            });
        }
        if reqwest::header::HeaderValue::from_str(database_id.as_deref().unwrap_or_default())
            .is_err()
        {
            return Err(AppError::InvalidUrl {
                url: update.url,
                reason: "invalid database ID header".into(),
            });
        }
    } else if database_id.is_some() {
        return Err(AppError::InvalidUrl { url: update.url,
            reason: "Database selection is only supported in Shared Cloud mode; database-specific gateways reject this header".into() });
    }
    let same_target = query_endpoint(&stored.url, stored.protocol).ok().as_ref() == Some(&endpoint)
        && stored.database_id == database_id
        && stored.deployment == update.deployment;
    Ok(Connection {
        url: update.url,
        protocol: update.protocol,
        deployment: update.deployment,
        database_id,
        api_key: resolve_api_key(update.api_key, stored.api_key.clone(), same_target),
        timeout_ms: update.timeout_ms.clamp(1_000, 600_000),
        writer_only: update.writer_only,
        revision: stored.revision + 1,
    })
}

#[cfg(test)]
mod tests;
