pub mod domains;
pub mod infrastructure;

use std::collections::HashMap;
use tokio::sync::RwLock;

pub struct AppState {
    pub connections: RwLock<HashMap<String, infrastructure::database::StoredConnection>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            domains::connection::service::connect_database,
            domains::connection::service::disconnect_database,
            domains::schema::service::get_schema,
            domains::query::service::execute_query,
            domains::query::service::update_cell,
            domains::schema::service::import_sql_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tablescape");
}
