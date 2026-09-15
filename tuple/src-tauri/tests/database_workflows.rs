use serde_json::json;
use tuple_lib::{
    domains::{
        connection::{
            models::ConnectionInput,
            service::{connect, disconnect},
        },
        query::{
            models::{DatabaseValue, UpdateCellRequest},
            service::{run, update},
        },
        schema::service::{import_file, introspect},
    },
    AppState,
};
use uuid::Uuid;

fn temp_path(extension: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("tuple-test-{}.{}", Uuid::new_v4(), extension))
}

#[tokio::test]
async fn sqlite_connection_query_and_schema_work_as_one_flow() {
    let path = temp_path("sqlite");
    let state = AppState::default();
    let connected = connect(
        ConnectionInput {
            name: "Integration DB".into(),
            kind: "sqlite".into(),
            url: None,
            path: Some(path.to_string_lossy().into_owned()),
            read_only: false,
        },
        &state,
    )
    .await
    .unwrap();
    let stored = state
        .connections
        .read()
        .await
        .get(&connected.connection.id)
        .cloned()
        .unwrap();

    run(
        &stored,
        "CREATE TABLE teams(id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
        500,
    )
    .await
    .unwrap();
    run(&stored, "CREATE TABLE members(id INTEGER PRIMARY KEY, team_id INTEGER REFERENCES teams(id), name TEXT);", 500).await.unwrap();
    run(
        &stored,
        "INSERT INTO teams(name) VALUES ('Platform'), ('Data');",
        500,
    )
    .await
    .unwrap();
    let result = run(&stored, "SELECT id, name FROM teams ORDER BY id", 500)
        .await
        .unwrap();
    assert_eq!(result.rows.len(), 2);
    assert_eq!(result.rows[0]["name"], "Platform");

    let unsafe_selector = update(
        &stored,
        &UpdateCellRequest {
            connection_id: connected.connection.id.clone(),
            schema: "main".into(),
            table: "teams".into(),
            column: "name".into(),
            data_type: "TEXT".into(),
            value: json!("Should not persist"),
            primary_keys: vec![DatabaseValue {
                column: "name".into(),
                data_type: "TEXT".into(),
                value: json!("Platform"),
            }],
        },
    )
    .await
    .unwrap_err();
    assert!(unsafe_selector.contains("primary key"));

    let updated = update(
        &stored,
        &UpdateCellRequest {
            connection_id: connected.connection.id.clone(),
            schema: "main".into(),
            table: "teams".into(),
            column: "name".into(),
            data_type: "TEXT".into(),
            value: json!("Infrastructure"),
            primary_keys: vec![DatabaseValue {
                column: "id".into(),
                data_type: "INTEGER".into(),
                value: json!(1),
            }],
        },
    )
    .await
    .unwrap();
    assert_eq!(updated.affected_rows, 1);
    let changed = run(&stored, "SELECT name FROM teams WHERE id = 1", 1)
        .await
        .unwrap();
    assert_eq!(changed.rows[0]["name"], "Infrastructure");

    let schema = introspect(&stored.pool, "Integration DB", "sqlite")
        .await
        .unwrap();
    assert_eq!(schema.tables.len(), 2);
    let members = schema
        .tables
        .iter()
        .find(|table| table.name == "members")
        .unwrap();
    assert_eq!(members.foreign_keys[0].to_table, "teams");

    disconnect(&connected.connection.id, &state).await.unwrap();
    std::fs::remove_file(path).ok();
}

#[tokio::test]
async fn read_only_connections_reject_mutations_but_allow_reads() {
    let path = temp_path("sqlite");
    let writable_state = AppState::default();
    let writable = connect(
        ConnectionInput {
            name: "Writable".into(),
            kind: "sqlite".into(),
            url: None,
            path: Some(path.to_string_lossy().into_owned()),
            read_only: false,
        },
        &writable_state,
    )
    .await
    .unwrap();
    let stored = writable_state
        .connections
        .read()
        .await
        .get(&writable.connection.id)
        .cloned()
        .unwrap();
    run(
        &stored,
        "CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT);",
        500,
    )
    .await
    .unwrap();
    run(&stored, "INSERT INTO notes(body) VALUES ('hello');", 500)
        .await
        .unwrap();
    disconnect(&writable.connection.id, &writable_state)
        .await
        .unwrap();

    let state = AppState::default();
    let readonly = connect(
        ConnectionInput {
            name: "Readonly".into(),
            kind: "sqlite".into(),
            url: None,
            path: Some(path.to_string_lossy().into_owned()),
            read_only: true,
        },
        &state,
    )
    .await
    .unwrap();
    let stored = state
        .connections
        .read()
        .await
        .get(&readonly.connection.id)
        .cloned()
        .unwrap();
    assert_eq!(
        run(&stored, "SELECT * FROM notes", 10)
            .await
            .unwrap()
            .rows
            .len(),
        1
    );
    let error = run(&stored, "UPDATE notes SET body = 'changed'", 10)
        .await
        .unwrap_err();
    assert!(error.contains("read-only"));
    let edit_error = update(
        &stored,
        &UpdateCellRequest {
            connection_id: readonly.connection.id.clone(),
            schema: "main".into(),
            table: "notes".into(),
            column: "body".into(),
            data_type: "TEXT".into(),
            value: json!("changed"),
            primary_keys: vec![DatabaseValue {
                column: "id".into(),
                data_type: "INTEGER".into(),
                value: json!(1),
            }],
        },
    )
    .await
    .unwrap_err();
    assert!(edit_error.contains("read-only"));

    disconnect(&readonly.connection.id, &state).await.unwrap();
    std::fs::remove_file(path).ok();
}

#[tokio::test]
async fn sqlite_compatible_sql_import_becomes_browseable() {
    let path = temp_path("sql");
    std::fs::write(&path, "CREATE TABLE categories(id INTEGER PRIMARY KEY, name TEXT); INSERT INTO categories(name) VALUES ('Books'), ('Music');").unwrap();
    let state = AppState::default();
    let imported = import_file(path.to_str().unwrap(), "Catalog dump", &state)
        .await
        .unwrap();
    assert!(imported.connection.connected);
    assert_eq!(imported.schema.tables[0].name, "categories");
    let stored = state
        .connections
        .read()
        .await
        .get(&imported.connection.id)
        .cloned()
        .unwrap();
    let result = run(&stored, "SELECT * FROM categories ORDER BY id", 50)
        .await
        .unwrap();
    assert_eq!(result.rows.len(), 2);
    assert_eq!(result.rows[1]["name"], "Music");
    disconnect(&imported.connection.id, &state).await.unwrap();
    std::fs::remove_file(path).ok();
}

#[tokio::test]
async fn non_sqlite_ddl_falls_back_to_static_schema_parsing() {
    let path = temp_path("sql");
    std::fs::write(&path, "CREATE TABLE public.accounts (id UUID PRIMARY KEY, email VARCHAR(255) NOT NULL); CREATE TABLE public.orders (id BIGSERIAL PRIMARY KEY, account_id UUID REFERENCES public.accounts(id), amount MONEY);").unwrap();
    let state = AppState::default();
    let imported = import_file(path.to_str().unwrap(), "Postgres dump", &state)
        .await
        .unwrap();
    assert!(!imported.connection.connected);
    assert_eq!(imported.schema.tables.len(), 2);
    let orders = imported
        .schema
        .tables
        .iter()
        .find(|table| table.name == "orders")
        .unwrap();
    assert_eq!(orders.foreign_keys[0].to_table, "accounts");
    std::fs::remove_file(path).ok();
}
