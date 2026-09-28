use super::*;
use crate::hql::{compile_source_for, Protocol};
use serde_json::json;

#[test]
fn samples_distinguish_types_count_presence_and_cap_distinct_values() {
    let rows: Vec<Row> = [
        json!({"z":1,"mixed":null}),
        json!({"mixed":1}),
        json!({"mixed":"1"}),
        json!({"mixed":true}),
        json!({"mixed":1}),
        json!({"nested":{"a":[1]}}),
    ]
    .into_iter()
    .map(|value| value.as_object().unwrap().clone())
    .collect();
    let fields = infer_schema_fields(&rows);
    assert_eq!(
        fields
            .iter()
            .map(|field| field.name.as_str())
            .collect::<Vec<_>>(),
        vec!["mixed", "nested", "z"]
    );
    assert_eq!(fields[0].present_on, 5);
    assert_eq!(
        fields[0].types,
        vec!["null", "integer", "string", "boolean"]
    );
    assert_eq!(fields[0].values, vec![json!(null), json!(1), json!("1")]);
    assert_eq!(fields[1].types, vec!["object"]);
    assert_eq!(fields[2].present_on, 1);
}

#[test]
fn empty_samples_have_no_fields_and_nested_large_integers_are_ipc_safe() {
    assert!(infer_schema_fields(&[]).is_empty());
    let row = json!({"nested":{"ids":[u64::MAX]}})
        .as_object()
        .unwrap()
        .clone();
    let fields = infer_schema_fields(&[row]);
    assert_eq!(fields[0].types, vec!["object"]);
    assert_eq!(fields[0].values[0]["ids"][0], u64::MAX.to_string());
}

#[test]
fn generated_queries_quote_keywords_quotes_unicode_and_punctuation_for_both_protocols() {
    for label in [
        "User",
        "SELECT",
        "a\"b",
        "a.b",
        "雪",
        "",
        "a; SHOW STATS --",
    ] {
        for entity in ["nodes", "edges"] {
            let query = schema_query_for(entity, label, 0);
            assert!(query.ends_with("LIMIT 1"));
            let value = SchemaLabel::new(
                LabelCount {
                    label: label.into(),
                    count: 0,
                },
                entity,
            );
            for protocol in [Protocol::V2, Protocol::LegacyV1] {
                for source in [&query, &value.browse_query, &value.graph_query] {
                    compile_source_for(source, protocol)
                        .unwrap_or_else(|error| panic!("{source:?}: {error}"));
                }
            }
        }
    }
}
