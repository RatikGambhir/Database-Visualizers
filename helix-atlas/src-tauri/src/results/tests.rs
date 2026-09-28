#[cfg(test)]
mod legacy {
    use serde_json::json;

    use super::super::*;

    #[test]
    fn reads_rows_from_supported_envelopes() {
        let shape = ResultShape::Rows {
            variable: "rows".into(),
            columns: None,
            sources: None,
            identity_variable: None,
        };
        for body in [
            json!({ "rows": [{ "$id": 1, "$label": "User", "name": "Alice" }] }),
            json!({ "data": { "rows": [{ "id": 1 }] } }),
            json!([{ "id": 1 }]),
            json!({ "rows": { "properties": [{ "$id": 1 }] } }),
        ] {
            let QueryResult::Rows { rows, .. } = read_result(&body, &shape).unwrap() else {
                panic!("expected rows");
            };
            assert_eq!(rows.len(), 1);
        }
    }

    #[test]
    fn graph_reader_deduplicates_and_drops_dangling_edges() {
        let shape = ResultShape::Graph {
            node_variable: "nodes".into(),
            edge_variable: "edges".into(),
            node_limit: 10,
            edge_limit: 10,
        };
        let body = json!({
            "nodes": [{ "_id": 1, "_label": "User" }, { "_id": 2, "_label": "User" }],
            "edges": [
                { "_id": 10, "_src": 1, "_dst": 2 },
                { "_id": 11, "_src": 1, "_dst": 99 },
                { "_id": 11, "_src": 1, "_dst": 99 }
            ]
        });
        let QueryResult::Graph { graph } = read_result(&body, &shape).unwrap() else {
            panic!("expected graph");
        };
        assert_eq!(graph.edges.len(), 1);
        assert_eq!(graph.dangling_edges, 1);
    }

    #[test]
    fn preserves_large_property_integers_as_strings_for_ipc() {
        let shape = ResultShape::Rows {
            variable: "rows".into(),
            columns: None,
            sources: None,
            identity_variable: None,
        };
        let QueryResult::Rows { rows, .. } = read_result(
            &json!({ "rows": [{ "$id": 9223372036854775807_i64, "external": 9223372036854775807_i64 }] }),
            &shape,
        )
        .unwrap()
        else {
            panic!("expected rows");
        };
        assert_eq!(rows[0]["id"], json!("9223372036854775807"));
        assert_eq!(rows[0]["external"], json!("9223372036854775807"));
    }

    #[test]
    fn schema_rows_keep_large_property_integers_numeric() {
        let shape = ResultShape::Rows {
            variable: "rows".into(),
            columns: None,
            sources: None,
            identity_variable: None,
        };
        let rows = decode_rows_for_schema(r#"{"rows":[{"external":9223372036854775807}]}"#, &shape)
            .unwrap();
        assert_eq!(rows[0]["external"], json!(9223372036854775807_i64));
    }

    #[test]
    fn reads_group_counts_from_samples() {
        let groups = read_group_count(&json!({
            "properties": [{ "$label": "User" }, { "$label": "Post" }, { "$label": "Post" }]
        }))
        .unwrap();
        assert_eq!(
            groups[0],
            LabelCount {
                label: "Post".into(),
                count: 2
            }
        );
    }

    #[test]
    fn describe_payload_stays_flat_for_the_typescript_contract() {
        let result = QueryResult::Describe {
            data: Box::new(DescribeResult {
                entity: "nodes",
                id: Some("1".into()),
                label: Some("User".into()),
                properties: Row::new(),
                edges: Vec::new(),
                neighbours: Vec::new(),
                degree: Some(0),
                endpoints: None,
            }),
        };
        let value = serde_json::to_value(result).unwrap();
        assert_eq!(value["kind"], "describe");
        assert_eq!(value["entity"], "nodes");
        assert_eq!(value["id"], "1");
        assert!(value.get("data").is_none());
    }
}

#[cfg(test)]
mod compatibility_tests {
    use super::super::graph::{read_graph_edge, read_graph_node};
    use super::super::rows::merge_identity;
    use super::super::*;
    use crate::hql::compile_source_for;
    use crate::hql::Protocol;
    use serde_json::json;
    use serde_json::Map;

    #[test]
    fn real_server_compiler_fixtures_replay_without_http() {
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../contracts/helixdb-v2/helixsql-conformance.json"
        ))
        .unwrap();
        for capture in fixture["captures"].as_array().unwrap() {
            let source = capture["source"].as_str().unwrap();
            let compiled = compile_source_for(source, Protocol::V2).unwrap();
            assert_eq!(
                serde_json::from_str::<Value>(&compiled.transport_json).unwrap(),
                capture["request"],
                "{source}"
            );
            let result =
                decode_compiled_response(&capture["response"].to_string(), &compiled).unwrap();
            assert_eq!(
                serde_json::to_value(result).unwrap(),
                capture["result"],
                "{source}"
            );
        }
    }
    #[test]
    fn strict_v2_missing_malformed_or_misassociated_returns_are_errors() {
        let compiled = compile_source_for("QUERY LIMIT 2", Protocol::V2).unwrap();
        for value in [
            json!({"unexpected":[]}),
            json!([]),
            json!({"nodes":[42],"edges":[]}),
        ] {
            assert!(decode_compiled_response(&value.to_string(), &compiled).is_err());
        }
        let compiled = compile_source_for("SELECT * FROM NODES", Protocol::V2).unwrap();
        for value in [
            json!({"rows":[42],"__rows_ids":[0],"__rows_labels":["User"]}),
            json!({"rows":[{}],"__rows_ids":[],"__rows_labels":["User"]}),
            json!({"rows":[{}],"__rows_ids":[-1],"__rows_labels":["User"]}),
            json!({"rows":[{}],"__rows_ids":[1.5],"__rows_labels":["User"]}),
        ] {
            assert!(decode_compiled_response(&value.to_string(), &compiled).is_err());
        }
        for rows in [Value::Null, json!([])] {
            let value = json!({"rows":rows,"__rows_ids":[],"__rows_labels":[]});
            let QueryResult::Rows { rows, .. } =
                decode_compiled_response(&value.to_string(), &compiled).unwrap()
            else {
                panic!("rows")
            };
            assert!(rows.is_empty());
        }
    }
    #[test]
    fn full_unsigned_ids_and_duplicate_rows_remain_associated() {
        let compiled = compile_source_for("SELECT * FROM NODES", Protocol::V2).unwrap();
        let value = json!({"rows":[{"name":"second"},{"name":"first"},{"name":"second"}],"__rows_ids":[u64::MAX,0,u64::MAX],"__rows_labels":["User","User","User"]});
        let QueryResult::Rows { rows, .. } =
            decode_compiled_response(&value.to_string(), &compiled).unwrap()
        else {
            panic!("rows")
        };
        assert_eq!(rows[0]["id"], "18446744073709551615");
        assert_eq!(rows[1]["id"], "0");
        assert_eq!(rows[2]["name"], "second");
        let compiled =
            compile_source_for("DESCRIBE EDGE 18446744073709551615", Protocol::V2).unwrap();
        let value = json!({"entity":[{}],"__entity_ids":[u64::MAX],"__entity_labels":["Rel"],"__entity_from":[u64::MAX-1],"__entity_to":[0],"sourceNode":[],"__sourceNode_ids":[],"__sourceNode_labels":[],"targetNode":[],"__targetNode_ids":[],"__targetNode_labels":[]});
        let QueryResult::Describe { data } =
            decode_compiled_response(&value.to_string(), &compiled).unwrap()
        else {
            panic!("describe")
        };
        assert_eq!(data.id.as_deref(), Some("18446744073709551615"));
    }
    #[test]
    fn exact_metadata_wins_over_legacy_lookalikes_and_endpoint_properties_are_safe() {
        let node: Row = serde_json::from_str(
            r#"{"$id":"0","_id":42,"$label":"User","_label":"stored","large":9007199254740993}"#,
        )
        .unwrap();
        let node = read_graph_node(&node).unwrap();
        assert_eq!(node.id, "0");
        assert_eq!(node.label.as_deref(), Some("User"));
        assert_eq!(node.properties["large"], "9007199254740993");
        let edge: Row = serde_json::from_str(
            r#"{"$id":0,"_id":42,"$from":0,"_src":43,"$to":18446744073709551615,"_dst":44}"#,
        )
        .unwrap();
        let edge = read_graph_edge(&edge).unwrap();
        assert_eq!(edge.id, "0");
        assert_eq!(edge.source, "0");
        assert_eq!(edge.target, "18446744073709551615");
    }
    #[test]
    fn legacy_identity_merge_joins_exact_keys_and_preserves_duplicate_rows() {
        let rows = vec![
            json!({"$id":2,"name":"two"}),
            json!({"$id":1,"name":"one"}),
            json!({"$id":2,"name":"two"}),
        ];
        let identity = vec![
            json!({"$id":1,"$label":"One"}),
            json!({"$id":2,"$label":"Two"}),
        ];
        let merged = merge_identity(
            rows.into_iter()
                .map(|v| v.as_object().unwrap().clone())
                .collect(),
            identity
                .into_iter()
                .map(|v| v.as_object().unwrap().clone())
                .collect(),
        )
        .unwrap();
        assert_eq!(merged[0]["$label"], "Two");
        assert_eq!(merged.len(), 3);
        assert!(merge_identity(vec![Map::new()], vec![]).is_err());
    }
    #[test]
    fn v2_counts_and_groups_reject_invalid_terminal_shapes() {
        let count = compile_source_for("SELECT COUNT(*) FROM NODES", Protocol::V2).unwrap();
        for value in [
            json!({"rows":[1]}),
            json!({"rows":"1"}),
            json!({"rows":null}),
        ] {
            assert!(decode_compiled_response(&value.to_string(), &count).is_err());
        }
        let groups =
            compile_source_for("SELECT COUNT(*) FROM NODES GROUP BY status", Protocol::V2).unwrap();
        for value in [
            json!({"rows":{"active":2}}),
            json!({"rows":[{"status":"active","count":"2"}]}),
            json!({"rows":[{"count":2}]}),
        ] {
            assert!(decode_compiled_response(&value.to_string(), &groups).is_err());
        }
    }
}
