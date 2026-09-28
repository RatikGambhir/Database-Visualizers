use super::*;
use crate::hql::Protocol;
use std::sync::atomic::{AtomicUsize, Ordering};

struct ConfigDirectory(PathBuf);
impl ConfigDirectory {
    fn new() -> Self {
        static NEXT: AtomicUsize = AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "helix-atlas-state-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn path(&self) -> PathBuf {
        self.0.join("nested/connection.json")
    }
}
impl Drop for ConfigDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn update() -> ConnectionUpdate {
    serde_json::from_value(serde_json::json!({"url":"localhost:7000","protocol":"v2","apiKey":"test-key","timeoutMs":500,"writerOnly":true})).unwrap()
}

#[test]
fn save_creates_parent_directories_and_round_trips_settings_without_persisting_revision() {
    let directory = ConfigDirectory::new();
    let path = directory.path();
    let state = AppState::new();
    state.initialize(path.clone());
    let view = state.update_connection(update()).unwrap();
    assert_eq!(view.revision, 1);
    assert_eq!(view.timeout_ms, 1000);
    assert!(view.writer_only && view.has_api_key);
    let raw: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert!(raw.get("revision").is_none());
    let restored = AppState::new();
    restored.initialize(path);
    assert_eq!(restored.snapshot().url, "localhost:7000");
    assert_eq!(restored.snapshot().protocol, Protocol::V2);
    assert_eq!(restored.snapshot().revision, 0);
    assert_eq!(restored.snapshot().api_key.as_deref(), Some("test-key"));
}

#[test]
fn failed_persistence_does_not_replace_the_live_connection() {
    let directory = ConfigDirectory::new();
    let parent = directory.0.join("not-a-directory");
    std::fs::write(&parent, "file").unwrap();
    let state = AppState::new();
    state.initialize(parent.join("connection.json"));
    let before = state.snapshot();
    assert!(state.update_connection(update()).is_err());
    let after = state.snapshot();
    assert_eq!(after.url, before.url);
    assert_eq!(after.revision, before.revision);
    assert_eq!(after.api_key, before.api_key);
}

#[test]
fn malformed_config_falls_back_to_defaults_and_can_be_replaced() {
    let directory = ConfigDirectory::new();
    let path = directory.0.join("connection.json");
    std::fs::write(&path, "not JSON").unwrap();
    let state = AppState::new();
    state.initialize(path.clone());
    assert_eq!(state.snapshot().url, Connection::default().url);
    state.update_connection(update()).unwrap();
    assert!(load_connection(&path).is_some());
}

#[test]
fn invalid_candidate_never_changes_state_or_creates_a_config_file() {
    let directory = ConfigDirectory::new();
    let path = directory.path();
    let state = AppState::new();
    state.initialize(path.clone());
    let mut invalid = update();
    invalid.url = "ftp://example.com".into();
    assert!(state.update_connection(invalid).is_err());
    assert_eq!(state.snapshot().revision, 0);
    assert!(!path.exists());
}

#[cfg(unix)]
#[test]
fn persisted_credentials_are_readable_only_by_the_owner() {
    use std::os::unix::fs::PermissionsExt;
    let directory = ConfigDirectory::new();
    let path = directory.path();
    let state = AppState::new();
    state.initialize(path.clone());
    state.update_connection(update()).unwrap();
    assert_eq!(
        std::fs::metadata(path).unwrap().permissions().mode() & 0o777,
        0o600
    );
}
