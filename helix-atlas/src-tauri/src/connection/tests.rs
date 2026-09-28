use super::*;

fn endpoint(base: &str) -> String {
    query_endpoint(base, Protocol::LegacyV1)
        .unwrap()
        .to_string()
}

#[test]
fn appends_the_query_path_to_a_bare_origin() {
    assert_eq!(
        endpoint("http://localhost:6969"),
        "http://localhost:6969/v1/query"
    );
}

#[test]
fn a_trailing_slash_does_not_double_up() {
    assert_eq!(
        endpoint("http://localhost:6969/"),
        "http://localhost:6969/v1/query"
    );
}

#[test]
fn a_gateway_path_prefix_is_preserved() {
    assert_eq!(
        endpoint("https://gateway.example.com/helix"),
        "https://gateway.example.com/helix/v1/query"
    );
}

#[test]
fn a_scheme_less_host_is_assumed_to_be_http() {
    assert_eq!(endpoint("localhost:6969"), "http://localhost:6969/v1/query");
}

#[test]
fn a_pasted_full_endpoint_is_not_doubled_up() {
    assert_eq!(
        endpoint("http://localhost:6969/v1/query"),
        "http://localhost:6969/v1/query"
    );
    assert_eq!(
        endpoint("https://gateway.example.com/helix/v1/query/"),
        "https://gateway.example.com/helix/v1/query"
    );
    // A path that merely contains the segments elsewhere still gets them.
    assert_eq!(
        endpoint("https://gateway.example.com/v1/query/helix"),
        "https://gateway.example.com/v1/query/helix/v1/query"
    );
}

#[test]
fn an_omitted_api_key_keeps_the_saved_one() {
    // The settings form omits the key unless the user typed one, so a probe
    // of an unchanged connection has to reuse what is already on file.
    assert_eq!(
        resolve_api_key(None, Some("hx_saved".into()), true),
        Some("hx_saved".into())
    );
    assert_eq!(resolve_api_key(None, Some("hx_saved".into()), false), None);
    // An explicit empty string is the "remove the saved key" signal.
    assert_eq!(
        resolve_api_key(Some(String::new()), Some("hx_saved".into()), true),
        None
    );
    assert_eq!(
        resolve_api_key(Some("hx_new".into()), Some("hx_saved".into()), false),
        Some("hx_new".into())
    );
    assert_eq!(resolve_api_key(None, None, true), None);
    // A stored empty string is treated as no key at all.
    assert_eq!(resolve_api_key(None, Some(String::new()), true), None);
}

#[test]
fn saved_keys_are_reused_only_for_the_same_effective_endpoint() {
    assert!(is_same_endpoint(
        "https://helix.example.com",
        "https://helix.example.com/"
    ));
    assert!(is_same_endpoint(
        "https://helix.example.com/v1/query",
        "https://helix.example.com"
    ));
    assert!(!is_same_endpoint(
        "https://helix.example.com",
        "https://other.example.com"
    ));
    assert!(!is_same_endpoint(
        "https://gateway.example.com/team-a",
        "https://gateway.example.com/team-b"
    ));
}

#[test]
fn non_http_schemes_are_rejected() {
    assert!(query_endpoint("ftp://localhost:6969", Protocol::LegacyV1).is_err());
    assert!(query_endpoint("   ", Protocol::LegacyV1).is_err());
}

#[test]
fn the_connection_view_reports_key_presence_without_leaking_it() {
    let with_key = Connection {
        api_key: Some("hx_secret".into()),
        ..Connection::default()
    };
    let view = ConnectionView::from(&with_key);
    assert!(view.has_api_key);

    let serialized = serde_json::to_string(&view).unwrap();
    assert!(!serialized.contains("hx_secret"));

    let empty_key = Connection {
        api_key: Some(String::new()),
        ..Connection::default()
    };
    assert!(!ConnectionView::from(&empty_key).has_api_key);
}

#[test]
fn invalid_shared_cloud_targets_and_header_injection_are_rejected() {
    let stored = Connection::default();
    for (protocol, database_id) in [
        (Protocol::LegacyV1, Some("db")),
        (Protocol::V2, None),
        (Protocol::V2, Some("  ")),
        (Protocol::V2, Some("db\nInjected: true")),
    ] {
        let update: ConnectionUpdate = serde_json::from_value(serde_json::json!({"url":"https://cloud.example.com","protocol":protocol,"deployment":"sharedCloud","databaseId":database_id})).unwrap();
        assert!(candidate_connection(update, &stored).is_err());
    }
}

#[test]
fn changing_deployment_clears_stored_credentials_even_at_the_same_endpoint() {
    let stored = Connection {
        api_key: Some("old-secret".into()),
        ..Connection::default()
    };
    let update: ConnectionUpdate = serde_json::from_value(
        serde_json::json!({"url":stored.url,"protocol":"v2","deployment":"databaseCloud"}),
    )
    .unwrap();
    assert!(candidate_connection(update, &stored)
        .unwrap()
        .api_key
        .is_none());
}
