use super::*;
use crate::hql::{compile_source_for, Protocol};
use serde_json::json;

#[test]
fn only_http_200_is_a_success_and_errors_keep_the_original_body() {
    for status in [201, 204, 301, 400, 401, 404, 429, 500, 503] {
        let body = r#"{"error":"read_failed","msg":"retry later"}"#;
        let error = require_success(QueryResponse {
            status,
            body: body.into(),
            duration_ms: 1,
        })
        .unwrap_err();
        let payload = serde_json::to_value(error).unwrap();
        assert_eq!(payload["kind"], "http");
        assert_eq!(payload["status"], status);
        assert_eq!(payload["code"], "read_failed");
        assert_eq!(payload["detail"], body);
        assert!(payload["message"].as_str().unwrap().contains("retry later"));
    }
    let response = require_success(QueryResponse {
        status: 200,
        body: "{}".into(),
        duration_ms: 9,
    })
    .unwrap();
    assert_eq!(response.duration_ms, 9);
}

#[test]
fn empty_plain_text_and_malformed_json_errors_do_not_invent_codes() {
    for body in [
        "",
        "  ",
        "proxy failed",
        "{broken",
        r#"{"error":123,"msg":false}"#,
    ] {
        let error = require_success(QueryResponse {
            status: 502,
            body: body.into(),
            duration_ms: 0,
        })
        .unwrap_err();
        let payload = serde_json::to_value(error).unwrap();
        assert!(payload["code"].is_null());
        if body.trim().is_empty() {
            assert!(payload["detail"].is_null());
        } else {
            assert_eq!(payload["detail"], body.trim());
        }
    }
}

#[test]
fn request_bounds_timeouts_and_never_emits_cloud_headers_for_ordinary_servers() {
    let http = reqwest::Client::new();
    for (timeout, expected) in [(0, 1000), (1000, 1000), (30000, 30000), (u64::MAX, 600000)] {
        let conn = Connection {
            timeout_ms: timeout,
            ..Connection::default()
        };
        let request = query_request(&http, &conn, "{}".into())
            .unwrap()
            .build()
            .unwrap();
        assert_eq!(request.timeout(), Some(&Duration::from_millis(expected)));
        assert_eq!(request.headers()["content-type"], "application/json");
        assert!(!request.headers().contains_key("authorization"));
        assert!(!request.headers().contains_key("x-helix-database-id"));
        assert!(!request.headers().contains_key("x-helix-require-writer"));
    }
}

#[test]
fn compiled_previews_include_the_effective_endpoint_and_current_revision() {
    let compiled = compile_source_for("SHOW STATS", Protocol::V2).unwrap();
    let conn = Connection {
        url: "https://gateway.example.com/helix/".into(),
        revision: 19,
        ..Connection::default()
    };
    let view = compiled_view(&compiled, &conn).unwrap();
    assert_eq!(view.endpoint, "https://gateway.example.com/helix/v2/query");
    assert_eq!(view.connection_revision, 19);
    assert_eq!(
        serde_json::to_value(view).unwrap()["executionKind"],
        json!("read")
    );
}
