//! Structured failures shared by transport and Tauri commands.

use crate::hql::{HqlError, Span};
use crate::results::ResultError;
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("invalid instance URL {url:?}: {reason}")]
    InvalidUrl { url: String, reason: String },
    #[error("could not reach {url}: {reason}")]
    Unreachable { url: String, reason: String },
    #[error("request timed out after {0}ms")]
    Timeout(u64),
    #[error("{0}")]
    Io(String),
    #[error("{0}")]
    Hql(#[from] HqlError),
    #[error("{0}")]
    Result(#[from] ResultError),
    #[error("HelixDB returned HTTP {status}{diagnostic}")]
    HttpStatus {
        status: u16,
        detail: Option<String>,
        code: Option<String>,
        diagnostic: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload<'a> {
    kind: &'static str,
    status: Option<u16>,
    code: Option<&'a str>,
    message: String,
    detail: Option<&'a str>,
    span: Option<&'a Span>,
    hint: Option<&'a str>,
}

// Tauri command errors cross IPC as a stable structured contract so the editor
// can retain source spans and the UI can distinguish transport failures.
impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        let (kind, detail, span, hint) = match self {
            Self::InvalidUrl { reason, .. } => ("invalidUrl", Some(reason.as_str()), None, None),
            Self::Unreachable { reason, .. } => ("transport", Some(reason.as_str()), None, None),
            Self::Timeout(_) => ("transport", None, None, None),
            Self::Io(detail) => ("io", Some(detail.as_str()), None, None),
            Self::Hql(error) => ("hql", None, error.span.as_ref(), error.hint.as_deref()),
            Self::Result(error) => ("result", error.detail.as_deref(), None, None),
            Self::HttpStatus { detail, .. } => ("http", detail.as_deref(), None, None),
        };
        ErrorPayload {
            kind,
            status: if let Self::HttpStatus { status, .. } = self {
                Some(*status)
            } else {
                None
            },
            code: if let Self::HttpStatus { code, .. } = self {
                code.as_deref()
            } else {
                None
            },
            message: self.to_string(),
            detail,
            span,
            hint,
        }
        .serialize(serializer)
    }
}

pub(crate) type Result<T> = std::result::Result<T, AppError>;
