use tauri::State;
use uuid::Uuid;

use crate::{
    domains::{
        connection::models::{ConnectResult, ConnectionInput, ConnectionProfile},
        schema::service::introspect,
    },
    infrastructure::database::{close_pool, open_pool, StoredConnection},
    AppState,
};

#[tauri::command]
pub async fn connect_database(
    config: ConnectionInput,
    state: State<'_, AppState>,
) -> Result<ConnectResult, String> {
    connect(config, &state).await
}

pub async fn connect(config: ConnectionInput, state: &AppState) -> Result<ConnectResult, String> {
    let name = config.name.trim();
    if name.is_empty() {
        return Err("Connection name is required.".into());
    }
    let (pool, detail) = open_pool(
        &config.kind,
        config.path.as_deref(),
        config.url.as_deref(),
        config.read_only,
    )
    .await?;
    let schema = introspect(&pool, name, &config.kind).await?;
    let id = Uuid::new_v4().to_string();
    state.connections.write().await.insert(
        id.clone(),
        StoredConnection {
            pool,
            name: name.to_string(),
            kind: config.kind.clone(),
            read_only: config.read_only,
        },
    );
    Ok(ConnectResult {
        connection: ConnectionProfile {
            id,
            name: name.to_string(),
            kind: config.kind,
            detail,
            connected: true,
            read_only: config.read_only,
        },
        schema,
    })
}

#[tauri::command]
pub async fn disconnect_database(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    disconnect(&connection_id, &state).await
}

pub async fn disconnect(connection_id: &str, state: &AppState) -> Result<(), String> {
    let connection = state
        .connections
        .write()
        .await
        .remove(connection_id)
        .ok_or("Connection not found.")?;
    close_pool(connection.pool).await;
    Ok(())
}
