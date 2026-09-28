use super::*;

#[test]
fn exact_id_sources_cover_unsigned_boundaries() {
    for id in [0_u64, 9_007_199_254_740_993, i64::MAX as u64 + 1, u64::MAX] {
        for source in [
            format!("DESCRIBE NODE {id}"),
            format!("DESCRIBE EDGE '{id}'"),
            format!("SELECT id FROM NODES WHERE id = {id}"),
            format!("SELECT id FROM EDGES WHERE id IN ({id})"),
        ] {
            let compiled = compile_source_for(&source, Protocol::V2).unwrap();
            let wire: Value = serde_json::from_str(&compiled.transport_json).unwrap();
            assert_eq!(wire["request_type"], "read");
            assert!(compiled.transport_json.contains(&id.to_string()));
            assert_eq!(compiled.protocol, Protocol::V2);
        }
    }
}
#[test]
fn numeric_validation_separates_signed_properties_and_unsigned_entities() {
    for source in [
        "DESCRIBE NODE -1",
        "DESCRIBE NODE 18446744073709551616",
        "SELECT id FROM NODES WHERE id = -1",
        "SELECT id FROM EDGES WHERE source = -1",
        "SELECT id FROM NODES WHERE id IN (18446744073709551616)",
        "SELECT id FROM NODES WHERE external = 9223372036854775808",
    ] {
        assert!(
            compile_source_for(source, Protocol::V2)
                .unwrap_err()
                .span
                .is_some(),
            "{source}"
        );
    }
    for source in [
        "SELECT id FROM NODES WHERE external = -9223372036854775808",
        "SELECT id FROM NODES WHERE external = 9223372036854775807",
    ] {
        assert!(compile_source_for(source, Protocol::V2).is_ok());
    }
    for source in [
        "DESCRIBE NODE 9223372036854775808",
        "SELECT id FROM NODES WHERE id = 18446744073709551615",
    ] {
        assert!(compile_source_for(source, Protocol::LegacyV1)
            .unwrap_err()
            .hint
            .is_some());
    }
}
#[test]
fn unsupported_clamped_id_operations_fail_with_a_span_and_hint() {
    for source in [
        "SELECT id FROM NODES WHERE id > 9223372036854775807",
        "SELECT id FROM EDGES WHERE target = 18446744073709551615",
        "SELECT id FROM NODES ORDER BY id",
        "SELECT COUNT(*) FROM NODES GROUP BY id",
    ] {
        let error = compile_source_for(source, Protocol::V2).unwrap_err();
        assert!(error.span.is_some(), "{source}");
        assert!(error.hint.is_some());
    }
}
#[test]
fn multi_key_ordering_uses_one_operator_and_bound_projection_sources() {
    let compiled = compile_source_for(
        "SELECT * FROM NODES ORDER BY age DESC, name ASC LIMIT 2 SKIP 1",
        Protocol::V2,
    )
    .unwrap();
    let wire: Value = serde_json::from_str(&compiled.transport_json).unwrap();
    let root = &wire["query"]["read"]["entries"][0]["query"]["root"];
    assert_eq!(root["limit"]["count"], json!({"literal":2}));
    assert_eq!(
        root["limit"]["input"]["skip"]["input"]["order_by_multiple"]["orderings"],
        json!([["age", "desc"], ["name", "asc"]])
    );
    assert_eq!(
        wire["query"]["read"]["entries"][1]["query"]["root"]["value_map"]["input"],
        json!({"inject":{"variable":"__rows_stream"}})
    );
    assert!(wire["query"].get("queries").is_none());
}
#[test]
fn aliases_preserve_quoted_metadata_property_names() {
    let source = "SELECT id AS entity_id, \"id\" AS stored_id FROM NODES";
    assert!(compile_source_for(source, Protocol::V2).is_ok());
    assert!(compile_source_for(source, Protocol::LegacyV1).is_ok());
    assert!(
        compile_source_for("SELECT id, \"id\" FROM NODES", Protocol::V2)
            .unwrap_err()
            .hint
            .unwrap()
            .contains("AS")
    );
}
