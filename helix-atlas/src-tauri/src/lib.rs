//! Backend for the Helix Atlas desktop app.
//!
//! The webview never parses HelixSQL or talks to HelixDB directly. It hands HQL
//! source to Rust, which lexes, parses, validates, compiles, executes, and
//! decodes the response into UI-facing view models. This boundary also keeps
//! the app free of webview CORS rules and the API key out of webview storage.

mod commands;
mod connection;
mod error;
mod hql;
mod results;
mod schema;
mod state;
mod transport;

pub use commands::schema::SchemaResponse;
pub use commands::{ProbeResponse, QueryExecution};
pub use connection::{Connection, ConnectionUpdate, ConnectionView, Deployment};
pub use error::AppError;
pub use state::AppState;
use tauri::Manager;

const CONFIG_FILE: &str = "connection.json";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::new())
        .setup(|app| {
            let path = app
                .path()
                .app_config_dir()
                .ok()
                .map(|d| d.join(CONFIG_FILE));
            if let Some(path) = path {
                let state = app.state::<AppState>();
                state.initialize(path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::compile_query,
            commands::run_query,
            commands::test_connection,
            commands::schema::load_schema,
            commands::get_connection,
            commands::set_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Helix Atlas");
}

#[cfg(test)]
mod compatibility_tests;
