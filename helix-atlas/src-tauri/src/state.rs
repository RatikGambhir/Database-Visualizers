//! Live application state and connection settings persistence.

use crate::connection::{candidate_connection, Connection, ConnectionUpdate, ConnectionView};
use crate::error::{AppError, Result};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    connection: Mutex<Connection>,
    config_path: Mutex<Option<PathBuf>>,
    pub(crate) http: reqwest::Client,
}

impl AppState {
    pub(crate) fn new() -> Self {
        Self {
            connection: Mutex::new(Connection::default()),
            config_path: Mutex::new(None),
            http: reqwest::Client::new(),
        }
    }

    pub(crate) fn snapshot(&self) -> Connection {
        self.connection
            .lock()
            .expect("connection mutex poisoned")
            .clone()
    }

    pub(crate) fn initialize(&self, path: PathBuf) {
        if let Some(saved) = load_connection(&path) {
            *self.connection.lock().expect("connection mutex poisoned") = saved;
        }
        *self.config_path.lock().expect("config path mutex poisoned") = Some(path);
    }

    pub(crate) fn update_connection(&self, update: ConnectionUpdate) -> Result<ConnectionView> {
        let mut guard = self.connection.lock().expect("connection mutex poisoned");
        let candidate = candidate_connection(update, &guard)?;
        // Save first so failed persistence does not change the live connection.
        save_connection(self, &candidate)?;
        *guard = candidate;
        Ok(ConnectionView::from(&*guard))
    }
}
fn save_connection(state: &AppState, conn: &Connection) -> Result<()> {
    let path = state
        .config_path
        .lock()
        .expect("config path mutex poisoned")
        .clone();
    let Some(path) = path else { return Ok(()) };

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| AppError::Io(e.to_string()))?;
    }
    let json = serde_json::to_string_pretty(conn).map_err(|e| AppError::Io(e.to_string()))?;
    std::fs::write(&path, json).map_err(|e| AppError::Io(e.to_string()))?;
    restrict_to_owner(&path)
}

/// The config file holds the API key in plain text, so on Unix it is narrowed
/// to `0600` after writing. Best-effort: a filesystem that cannot represent
/// the mode is not a reason to fail the save.
#[cfg(unix)]
fn restrict_to_owner(path: &PathBuf) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    Ok(())
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &PathBuf) -> Result<()> {
    Ok(())
}

fn load_connection(path: &PathBuf) -> Option<Connection> {
    let contents = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

#[cfg(test)]
mod tests;
