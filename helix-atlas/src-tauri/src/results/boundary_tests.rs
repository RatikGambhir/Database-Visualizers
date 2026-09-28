use super::*;
use crate::hql::{compile_source_for, Protocol};
use serde_json::json;

fn shape() -> ResultShape {
    ResultShape::Rows {
        variable: "rows".into(),
        columns: None,
        sources: None,
        identity_variable: None,
    }
}

#[test]
fn nested_safe_integer_conversion_preserves_boundaries_and_strings() {
    let mut value = json!({
        "safe": [9_007_199_254_740_991_i64, -9_007_199_254_740_991_i64],
        "unsafe": {"values": [9_007_199_254_740_992_i64, i64::MIN, u64::MAX]},
        "string": "9007199254740993", "float": 1.25, "null": null
    });
    make_value_safe(&mut value);
    assert!(value["safe"][0].is_number());
    assert!(value["safe"][1].is_number());
    assert_eq!(
        value["unsafe"]["values"],
        json!([
            "9007199254740992",
            "-9223372036854775808",
            "18446744073709551615"
        ])
    );
    assert_eq!(value["string"], "9007199254740993");
    assert_eq!(value["float"], 1.25);
    assert!(value["null"].is_null());
}

#[test]
fn empty_rows_are_valid_but_malformed_rows_and_missing_bindings_are_errors() {
    for body in [json!({"rows":null}), json!({"rows":[]})] {
        assert_eq!(
            read_result(&body, &shape()).unwrap(),
            QueryResult::Rows {
                rows: vec![],
                columns: vec![]
            }
        );
    }
    for body in [
        json!({"other":[],"another":[]}),
        json!({"rows":42}),
        json!({"rows":[{},null]}),
        json!({"rows":["wrong"]}),
    ] {
        let error = read_result(&body, &shape()).unwrap_err();
        assert!(error.detail.is_some());
    }
}

#[test]
fn rows_read_all_legacy_wrappers_and_order_identity_columns_first() {
    let row = json!({"$id":0,"$label":"User","$from":1,"$to":2,"z":3,"a":4});
    for wrapper in ["data", "result", "results"] {
        let body = json!({wrapper:{"rows":[row.clone()]}});
        let QueryResult::Rows { columns, rows } = read_result(&body, &shape()).unwrap() else {
            panic!("rows")
        };
        assert_eq!(columns, vec!["id", "label", "source", "target", "a", "z"]);
        assert_eq!(rows[0]["id"], "0");
        assert_eq!(rows[0]["source"], "1");
        assert!(!rows[0].contains_key("$id"));
    }
}

#[test]
fn aliased_projections_keep_missing_properties_null_and_endpoint_ids_exact() {
    let compiled = compile_source_for(
        "SELECT source AS parent, target, absent FROM EDGES",
        Protocol::V2,
    )
    .unwrap();
    let body = json!({"rows":[{}],"__rows_ids":[0],"__rows_labels":["Link"],"__rows_from":[u64::MAX],"__rows_to":[0]});
    let QueryResult::Rows { columns, rows } =
        decode_compiled_response(&body.to_string(), &compiled).unwrap()
    else {
        panic!("rows")
    };
    assert_eq!(columns, vec!["parent", "target", "absent"]);
    assert_eq!(rows[0]["parent"], u64::MAX.to_string());
    assert_eq!(rows[0]["target"], "0");
    assert!(rows[0]["absent"].is_null());
}

#[test]
fn v2_edge_projections_reject_missing_invalid_and_misassociated_endpoints() {
    let compiled = compile_source_for("SELECT * FROM EDGES", Protocol::V2).unwrap();
    let body = json!({"rows":[{}],"__rows_ids":[0],"__rows_labels":["Link"],"__rows_from":[1],"__rows_to":[2]});
    for (key, value) in [
        ("__rows_from", json!([])),
        ("__rows_to", json!([1, 2])),
        ("__rows_from", json!([-1])),
        ("__rows_to", json!([1.5])),
        ("__rows_to", json!(["2"])),
        ("__rows_labels", json!([null])),
    ] {
        let mut malformed = body.clone();
        malformed[key] = value;
        assert!(
            decode_compiled_response(&malformed.to_string(), &compiled).is_err(),
            "{key}: {malformed}"
        );
    }
    let mut missing = body;
    missing.as_object_mut().unwrap().remove("__rows_to");
    assert!(decode_compiled_response(&missing.to_string(), &compiled).is_err());
}

#[test]
fn graph_limits_account_for_raw_rows_while_duplicates_and_loops_stay_consistent() {
    let body = json!({"nodes":[{"$id":0},{"$id":0}],"edges":[{"$id":1,"$from":0,"$to":0},{"$id":1,"$from":0,"$to":0}]});
    let graph_shape = ResultShape::Graph {
        node_variable: "nodes".into(),
        edge_variable: "edges".into(),
        node_limit: 2,
        edge_limit: 2,
    };
    let QueryResult::Graph { graph } = read_result(&body, &graph_shape).unwrap() else {
        panic!("graph")
    };
    assert_eq!(graph.nodes.len(), 1);
    assert_eq!(graph.edges.len(), 1);
    assert_eq!(graph.edges[0].source, graph.edges[0].target);
    assert_eq!(graph.dangling_edges, 0);
    assert!(graph.truncated_nodes && graph.truncated_edges);
    for malformed in [
        json!({"nodes":[{}],"edges":[]}),
        json!({"nodes":[],"edges":[{"$id":1}]}),
    ] {
        assert!(read_result(&malformed, &graph_shape).is_err());
    }
}

#[test]
fn conflicting_legacy_identity_projections_fail_instead_of_overwriting() {
    let row = |value: Value| value.as_object().unwrap().clone();
    assert!(rows::merge_identity(
        vec![row(json!({"$id":1}))],
        vec![
            row(json!({"$id":1,"$label":"A"})),
            row(json!({"$id":1,"$label":"B"}))
        ]
    )
    .is_err());
    assert!(
        rows::merge_identity(vec![row(json!({"$id":2}))], vec![row(json!({"$id":1}))]).is_err()
    );
}

#[test]
fn invalid_json_and_long_diagnostics_are_safe_structured_errors() {
    let compiled = compile_source_for("SELECT * FROM NODES", Protocol::V2).unwrap();
    let error = decode_compiled_response("<html>proxy error</html>", &compiled).unwrap_err();
    assert!(error.message.contains("not JSON"));
    let error = read_result(&json!({"wrong":"雪".repeat(1000)}), &shape()).unwrap_err();
    assert!(error.detail.unwrap().chars().count() <= 601);
}

#[test]
fn legacy_counts_accept_known_envelopes_and_reject_negative_or_fractional_values() {
    let count_shape = ResultShape::Count {
        variable: "count".into(),
    };
    for count in [
        json!(3),
        json!("3"),
        json!([3]),
        json!({"total":3}),
        json!({"value":3}),
        json!({"count":3}),
    ] {
        assert_eq!(
            read_result(&json!({"count":count}), &count_shape).unwrap(),
            QueryResult::Count { value: 3 }
        );
    }
    for count in [json!(-1), json!(1.5), json!(null), json!("invalid")] {
        assert!(read_result(&json!({"count":count}), &count_shape).is_err());
    }
}
