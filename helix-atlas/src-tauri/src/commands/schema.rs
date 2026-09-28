//! Schema discovery and bounded per-label field sampling.

use crate::connection::Connection;
use crate::error::{AppError, Result};
use crate::hql::compile_source_for;
use crate::results::{decode_compiled_rows_for_schema, LabelCount, QueryResult, ResultError};
use crate::schema::{infer_schema_fields, schema_query_for, Schema, SchemaLabel};
use crate::state::AppState;
use crate::transport::{execute_compiled, post_query, require_success};
use serde::Serialize;
use std::sync::Arc;
use tauri::State;

pub(crate) const SCHEMA_QUERY: &str = "SHOW LABELS SAMPLE 5000";
const SCHEMA_SAMPLE: u64 = 5_000;
const SCHEMA_FIELD_SAMPLE: u64 = 25;
const SCHEMA_FIELD_CONCURRENCY: usize = 6;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaResponse {
    pub connection_revision: u64,
    pub schema: Schema,
    pub duration_ms: u64,
}
/// Discovers labels and samples their fields entirely in the backend. Per-label
/// sample failures are retained on that label so one unusual type does not hide
/// the rest of the schema.
#[tauri::command]
pub(crate) async fn load_schema(state: State<'_, AppState>) -> Result<SchemaResponse> {
    let conn = state.snapshot();
    let labels_query = compile_source_for(SCHEMA_QUERY, conn.protocol)?;
    let (labels, duration_ms) = execute_compiled(&state.http, &conn, &labels_query).await?;
    let QueryResult::Labels { nodes, edges } = labels else {
        return Err(AppError::Result(ResultError {
            message: "unexpected schema response".into(),
            detail: None,
        }));
    };

    let node_labels = sample_schema_labels(
        state.http.clone(),
        conn.clone(),
        "nodes",
        nodes.unwrap_or_default(),
    )
    .await?;
    let edge_labels = sample_schema_labels(
        state.http.clone(),
        conn.clone(),
        "edges",
        edges.unwrap_or_default(),
    )
    .await?;

    Ok(SchemaResponse {
        connection_revision: conn.revision,
        schema: Schema {
            node_labels,
            edge_labels,
            sample: SCHEMA_SAMPLE,
        },
        duration_ms,
    })
}

pub(crate) async fn sample_schema_labels(
    http: reqwest::Client,
    connection: Connection,
    entity: &'static str,
    labels: Vec<LabelCount>,
) -> Result<Vec<SchemaLabel>> {
    let semaphore = Arc::new(tokio::sync::Semaphore::new(SCHEMA_FIELD_CONCURRENCY));
    let mut tasks = tokio::task::JoinSet::new();
    let label_count = labels.len();
    for (index, value) in labels.into_iter().enumerate() {
        let http = http.clone();
        let connection = connection.clone();
        let semaphore = Arc::clone(&semaphore);
        tasks.spawn(async move {
            let _permit = semaphore
                .acquire_owned()
                .await
                .expect("schema semaphore remains open");
            let label = SchemaLabel::new(value, entity);
            (
                index,
                sample_schema_label(&http, &connection, entity, label).await,
            )
        });
    }

    let mut sampled = vec![None; label_count];
    while let Some(completed) = tasks.join_next().await {
        let (index, label) = completed.map_err(|error| AppError::Io(error.to_string()))?;
        sampled[index] = Some(label);
    }
    Ok(sampled.into_iter().flatten().collect())
}

async fn sample_schema_label(
    http: &reqwest::Client,
    connection: &Connection,
    entity: &str,
    mut label: SchemaLabel,
) -> SchemaLabel {
    let source = schema_query_for(entity, &label.label, SCHEMA_FIELD_SAMPLE);
    let sampled = async {
        let compiled = compile_source_for(&source, connection.protocol)?;
        let response =
            require_success(post_query(http, connection, compiled.transport_json.clone()).await?)?;
        decode_compiled_rows_for_schema(&response.body, &compiled).map_err(AppError::from)
    }
    .await;
    match sampled {
        Ok(rows) => {
            label.field_sample = rows.len();
            label.fields = infer_schema_fields(&rows);
        }
        Err(error) => label.field_error = Some(error.to_string()),
    }
    label
}
