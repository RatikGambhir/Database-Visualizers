use crate::commands::schema::{sample_schema_labels, SCHEMA_QUERY};
use crate::connection::{
    candidate_connection, query_endpoint, Connection, ConnectionUpdate, Deployment,
};
use crate::hql::{compile_source_for, Protocol};
use crate::results::{decode_compiled_response, QueryResult};
use crate::transport::{
    execute_compiled, post_query, query_request, require_success, QueryResponse,
};
use serde_json::{json, Value};

fn update(url: &str, protocol: Protocol) -> ConnectionUpdate {
    serde_json::from_value(
        json!({"url":url,"protocol":protocol,"timeoutMs":30000,"writerOnly":false}),
    )
    .unwrap()
}

#[test]
fn saved_connections_migrate_to_v1_but_new_connections_use_v2() {
    let saved: Connection = serde_json::from_value(json!({"url":"localhost:6969"})).unwrap();
    assert_eq!(saved.protocol, Protocol::LegacyV1);
    assert_eq!(Connection::default().protocol, Protocol::V2);
}

#[test]
fn endpoints_match_the_selected_protocol_and_preserve_gateway_prefixes() {
    for protocol in [Protocol::LegacyV1, Protocol::V2] {
        for base in [
            "http://localhost:6969",
            "localhost:6969/",
            "https://gateway.example.com/prefix",
        ] {
            let endpoint = query_endpoint(base, protocol).unwrap();
            assert!(endpoint.path().ends_with(protocol.path()));
        }
        let full = format!("https://gateway.example.com/prefix{}/", protocol.path());
        assert_eq!(
            query_endpoint(&full, protocol).unwrap().path(),
            format!("/prefix{}", protocol.path())
        );
        let other = if protocol == Protocol::V2 {
            Protocol::LegacyV1
        } else {
            Protocol::V2
        };
        assert!(query_endpoint(&full, other).is_err());
    }
}

#[test]
fn candidate_target_includes_protocol_database_and_deployment() {
    let stored = Connection {
        url: "https://example.com".into(),
        api_key: Some("secret".into()),
        ..Connection::default()
    };
    let same = candidate_connection(
        update("https://example.com/v2/query/", Protocol::V2),
        &stored,
    )
    .unwrap();
    assert_eq!(same.api_key.as_deref(), Some("secret"));
    assert_eq!(same.revision, 1);
    let different =
        candidate_connection(update("https://example.com", Protocol::LegacyV1), &stored).unwrap();
    assert_eq!(different.api_key, None);
    let mut shared = update("https://example.com", Protocol::V2);
    shared.deployment = Deployment::SharedCloud;
    assert!(candidate_connection(shared, &stored).is_err());
    let mut shared = update("https://example.com", Protocol::V2);
    shared.deployment = Deployment::SharedCloud;
    shared.database_id = Some("db-a".into());
    let shared = candidate_connection(shared, &stored).unwrap();
    assert_eq!(shared.api_key, None);
    let mut changed = update("https://example.com", Protocol::V2);
    changed.deployment = Deployment::SharedCloud;
    changed.database_id = Some("db-b".into());
    let with_key = Connection {
        api_key: Some("shared-secret".into()),
        ..shared
    };
    assert_eq!(
        candidate_connection(changed, &with_key).unwrap().api_key,
        None
    );
    let mut database = update("https://example.com", Protocol::V2);
    database.deployment = Deployment::DatabaseCloud;
    database.database_id = Some("unexpected".into());
    assert!(candidate_connection(database, &stored).is_err());
}

#[test]
fn structured_http_errors_preserve_status_code_message_and_original_body() {
    let error = require_success(QueryResponse {
        status: 503,
        body: r#"{"error":"writer_unavailable","msg":"choose a writer"}"#.into(),
        duration_ms: 0,
    })
    .unwrap_err();
    let payload = serde_json::to_value(error).unwrap();
    assert_eq!(payload["status"], 503);
    assert_eq!(payload["code"], "writer_unavailable");
    assert!(payload["message"]
        .as_str()
        .unwrap()
        .contains("choose a writer"));
    assert!(payload["detail"]
        .as_str()
        .unwrap()
        .contains("writer_unavailable"));
    let unknown = require_success(QueryResponse {
        status: 418,
        body: "unexpected proxy error".into(),
        duration_ms: 0,
    })
    .unwrap_err();
    assert_eq!(
        serde_json::to_value(unknown).unwrap()["detail"],
        "unexpected proxy error"
    );
}

fn corpus() -> Vec<&'static str> {
    vec![
            "SELECT * FROM NODES:User ORDER BY name LIMIT 20",
            "SELECT id, name, \"id\" AS stored_id, \"label\" AS stored_label, \"source\" AS stored_source, \"target\" AS stored_target FROM NODES:User ORDER BY name LIMIT 20",
            "SELECT id, source, target FROM EDGES:FOLLOWS LIMIT 20",
            "SELECT COUNT(*) FROM NODES", "SELECT COUNT(*) FROM EDGES",
            "SELECT COUNT(*) FROM NODES GROUP BY status",
            "SELECT id FROM NODES WHERE age BETWEEN 28 AND 31 AND name NOT LIKE '%z%' ORDER BY age DESC, name DESC LIMIT 2 SKIP 1",
            "SELECT id FROM NODES WHERE age IN (28,31) AND (HAS(optional) OR optional IS NULL)",
            "SELECT id FROM NODES WHERE optional IS NOT NULL",
            "SELECT id FROM NODES WHERE name LIKE 'A%' OR name LIKE '%ob' OR name LIKE '%aro%'",
            "SELECT id FROM NODES WHERE id IN (0, 0, 1, 18446744073709551615)",
            "SELECT id FROM NODES WHERE id = 18446744073709551615",
            "SELECT id FROM EDGES WHERE source = 0 AND target BETWEEN 0 AND 2",
            "SELECT * FROM NODES WHERE id = 0 TRAVERSE OUT FOLLOWS LIMIT 20",
            "SELECT DISTINCT * FROM NODES WHERE id = 0 TRAVERSE IN FOLLOWS LIMIT 20",
            "SELECT * FROM NODES WHERE id = 0 TRAVERSE BOTH FOLLOWS LIMIT 20",
            "SELECT * FROM NODES WHERE id = 0 TRAVERSE OUT EDGES FOLLOWS LIMIT 20",
            "SELECT * FROM NODES WHERE id = 0 TRAVERSE IN EDGES FOLLOWS LIMIT 20",
            "SELECT * FROM NODES WHERE id = 0 TRAVERSE BOTH EDGES FOLLOWS LIMIT 20",
            "SELECT * FROM EDGES WHERE id = 0 TRAVERSE SOURCE LIMIT 20",
            "SELECT * FROM EDGES WHERE id = 0 TRAVERSE TARGET LIMIT 20",
            "SELECT * FROM EDGES WHERE id = 0 TRAVERSE OTHER LIMIT 20",
            "SELECT * FROM NODES WHERE id = 0 TRAVERSE OUT FOLLOWS WHERE age >= 30 LIMIT 20",
            "QUERY NODES:User VIA FOLLOWS WITH name ORDER BY name LIMIT 3 EDGE LIMIT 10",
            "QUERY NODES WHERE id = 18446744073709551615 LIMIT 1",
            "SHOW LABELS SAMPLE 20", "SHOW NODE LABELS", "SHOW EDGE LABELS", "SHOW STATS",
            "DESCRIBE NODE 0 LIMIT 20", "DESCRIBE EDGE 0 LIMIT 20",
            "DESCRIBE NODE 18446744073709551615", "DESCRIBE EDGE 18446744073709551615",
        ]
}

#[test]
#[ignore = "requires the isolated seeded pinned v2 server; set HELIX_V2_TEST_URL"]
fn pinned_v2_server_executes_the_helixsql_read_corpus() {
    let url = std::env::var("HELIX_V2_TEST_URL")
        .expect("set HELIX_V2_TEST_URL to the isolated seeded server");
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let http = reqwest::Client::new();
        let conn = Connection {
            url,
            ..Connection::default()
        };
        let mut captures = Vec::new();
        for source in corpus() {
            let compiled = compile_source_for(source, Protocol::V2)
                .unwrap_or_else(|error| panic!("{source}: {error}"));
            let response = require_success(
                post_query(&http, &conn, compiled.transport_json.clone())
                    .await
                    .unwrap(),
            )
            .unwrap_or_else(|error| panic!("{source}: {error}"));
            let result = decode_compiled_response(&response.body, &compiled)
                .unwrap_or_else(|error| panic!("{source}: {error}; body {}", response.body));
            if source == "SELECT COUNT(*) FROM NODES" {
                assert_eq!(result, QueryResult::Count { value: 3 });
            }
            if source == "SELECT COUNT(*) FROM EDGES" {
                assert_eq!(result, QueryResult::Count { value: 4 });
            }
            if source.starts_with("SELECT id, name,") {
                let QueryResult::Rows { rows, .. } = &result else {
                    panic!("rows")
                };
                assert_eq!(rows[0]["id"], "0");
                assert_eq!(rows[0]["stored_id"], "stored-id");
            }
            if source == "DESCRIBE EDGE 0 LIMIT 20" {
                let QueryResult::Describe { data } = &result else {
                    panic!("describe")
                };
                let endpoints = data.endpoints.as_ref().unwrap();
                assert_eq!(endpoints.source.as_ref().unwrap().id, "0");
                assert_eq!(endpoints.target.as_ref().unwrap().id, "1");
            }
            captures.push(json!({
                "source": source,
                "request": serde_json::from_str::<Value>(&compiled.transport_json).unwrap(),
                "response": serde_json::from_str::<Value>(&response.body).unwrap(),
                "result": result,
            }));
        }
        let compiled = compile_source_for(SCHEMA_QUERY, Protocol::V2).unwrap();
        let labels = execute_compiled(&http, &conn, &compiled).await.unwrap().0;
        let QueryResult::Labels { nodes, .. } = labels else {
            panic!("labels")
        };
        let fields = sample_schema_labels(http, conn, "nodes", nodes.unwrap())
            .await
            .unwrap();
        assert!(fields.iter().all(|label| label.field_error.is_none()));
        let large = fields[0]
            .fields
            .iter()
            .find(|field| field.name == "large")
            .unwrap();
        assert_eq!(large.types, vec!["integer"]);
        assert_eq!(large.values, vec![json!("9007199254740993")]);
        let stored_id = fields[0]
            .fields
            .iter()
            .find(|field| field.name == "id")
            .unwrap();
        assert_eq!(stored_id.types, vec!["string"]);
        assert_eq!(stored_id.values, vec![json!("stored-id")]);
        if let Ok(path) = std::env::var("HELIX_CAPTURE_PATH") {
            std::fs::write(
                path,
                serde_json::to_string_pretty(&json!({
                    "upstreamCommit": "c72e64f0c7e480f3d125f071659d5e3ad7b8da15",
                    "captures": captures,
                }))
                .unwrap(),
            )
            .unwrap();
        }
    });
}

#[test]
fn read_requests_keep_credentials_and_execution_headers_on_the_correct_target() {
    let http = reqwest::Client::new();
    let conn = Connection {
        url: "https://example.com/gateway".into(),
        api_key: Some("test-key".into()),
        writer_only: true,
        deployment: Deployment::SharedCloud,
        database_id: Some("db-a".into()),
        ..Connection::default()
    };
    let request = query_request(&http, &conn, "{}".into())
        .unwrap()
        .build()
        .unwrap();
    assert_eq!(request.url().path(), "/gateway/v2/query");
    assert_eq!(request.headers()["authorization"], "Bearer test-key");
    assert_eq!(request.headers()["x-helix-require-writer"], "true");
    assert_eq!(request.headers()["x-helix-database-id"], "db-a");
    assert!(!request.headers().contains_key("x-helix-await-durable"));
    assert!(!request.headers().contains_key("x-helix-warm"));
    let ordinary = Connection {
        url: "https://example.com".into(),
        ..Connection::default()
    };
    let request = query_request(&http, &ordinary, "{}".into())
        .unwrap()
        .build()
        .unwrap();
    for name in [
        "authorization",
        "x-helix-require-writer",
        "x-helix-database-id",
        "x-helix-await-durable",
        "x-helix-warm",
    ] {
        assert!(!request.headers().contains_key(name));
    }
}
