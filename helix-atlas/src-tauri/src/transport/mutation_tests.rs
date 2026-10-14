use super::*;
use crate::hql::{
    compile_source_for, compile_source_with_parameters, ParameterValue, Parameters, Protocol,
};
use serde_json::{json, Value};

#[test]
#[ignore = "writes only to a fresh disposable patched HelixDB server on 127.0.0.1:17702"]
fn pinned_extension_executes_atomic_helixsql_mutations() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async {
        let conn = Connection { url: "http://127.0.0.1:17702".into(), protocol: Protocol::V2, ..Connection::default() };
        let http = reqwest::Client::new();
        async fn run(http: &reqwest::Client, conn: &Connection, source: &str) -> Result<QueryResult> {
            execute_compiled(http, conn, &compile_source_for(source, Protocol::V2)?).await.map(|r|r.0)
        }
        assert!(matches!(run(&http, &conn, "SELECT COUNT(*) FROM NODES").await.unwrap(), QueryResult::Count { value: 0 }), "refusing to seed a nonempty server");
        let cases = [
            "INSERT INTO NODES:User (name, age, optional, \"id\") VALUES ('Alice', 30, NULL, 'external') RETURNING *;",
            "BEGIN MUTATION; SELECT * FROM NODES:User WHERE name = 'Alice' AS alice; INSERT INTO NODES:User AS bob (name) VALUES ('Bob') RETURNING id, name; INSERT INTO EDGES:Follows (source,target,\"source\") VALUES (@alice,@bob,'crm') RETURNING id,source,target,\"source\" AS import_source; COMMIT;",
            "BEGIN MUTATION; INSERT INTO NODES:Fresh AS a DEFAULT VALUES; SELECT * FROM NODES:Fresh AS b; INSERT INTO EDGES:Self (source,target) VALUES (@b,@a),(@a,@b) RETURNING *; COMMIT;",
            "INSERT INTO NODES:Bulk (value) VALUES (9223372036854775807),(-9223372036854775808),(9007199254740993) RETURNING id,value;",
        ];
        let mut captures = Vec::new();
        for source in cases {
            let compiled = compile_source_for(source, Protocol::V2).unwrap();
            let (result, _) = execute_compiled(&http, &conn, &compiled).await.unwrap();
            assert!(matches!(result, QueryResult::Mutation { outcome: "committed", .. }));
            captures.push(json!({"source":source,"request":serde_json::from_str::<Value>(&compiled.transport_json).unwrap(),"result":result}));
        }
        let first = &captures[0]["result"]["statements"][0]["entities"][0];
        assert_eq!(first["properties"]["id"], "external");
        assert_eq!(first["properties"]["optional"], Value::Null);
        assert_eq!(captures[1]["result"]["statements"][2]["rows"][0]["source"], first["id"]);
        for source in [
            "BEGIN MUTATION; INSERT INTO NODES:Rollback DEFAULT VALUES; SELECT * FROM NODES:Missing AS a; COMMIT;",
            "BEGIN MUTATION; INSERT INTO NODES:Rollback DEFAULT VALUES; SELECT * FROM NODES:User AS a; COMMIT;",
            "BEGIN MUTATION; INSERT INTO NODES:Rollback AS a DEFAULT VALUES; INSERT INTO EDGES:E (source,target) VALUES (18446744073709551615,@a); COMMIT;",
            "BEGIN MUTATION; INSERT INTO NODES:Rollback AS a DEFAULT VALUES; INSERT INTO EDGES:E (source,target) VALUES (@a,18446744073709551615); COMMIT;",
            "INSERT INTO EDGES:E (source,target) VALUES (0,0),(0,18446744073709551615);",
        ] {
            let before = serde_json::to_value(run(&http, &conn, "SHOW STATS").await.unwrap()).unwrap();
            let error = run(&http, &conn, source).await.unwrap_err();
            assert!(matches!(error, AppError::Mutation { outcome: "rolledBack", .. }), "{error:?}");
            assert_eq!(serde_json::to_value(run(&http, &conn, "SHOW STATS").await.unwrap()).unwrap(), before);
            captures.push(json!({"source":source,"error":serde_json::to_value(error).unwrap()}));
        }
        let params = Parameters::from([("from_id".into(), ParameterValue::NodeId("0".into())), ("to_id".into(), ParameterValue::NodeId("1".into()))]);
        let compiled = compile_source_with_parameters("INSERT INTO EDGES:Param (source,target) VALUES (:from_id,:to_id) RETURNING *", Protocol::V2, &params).unwrap();
        let (result, _) = execute_compiled(&http, &conn, &compiled).await.unwrap();
        assert_eq!(serde_json::to_value(result).unwrap()["insertedEdges"], 1);
        if let Ok(path) = std::env::var("HELIX_MUTATION_CAPTURE_PATH") {
            std::fs::write(path, serde_json::to_string_pretty(&json!({"contract":"atlas-mutation-v1","fixtures":captures})).unwrap()).unwrap();
        }
        execute_documented_walkthrough(&http, &conn).await;
    });
}

async fn execute_documented_walkthrough(http: &reqwest::Client, conn: &Connection) {
    let guide = include_str!("../../../docs/mutation-walkthrough.md");
    let mut endpoints = Parameters::new();
    for section in guide.split("```sql\n").skip(1) {
        let source = section.split("```").next().unwrap();
        let invalid = ["missing label", "(-1, 0)", "wrong width", "@later"]
            .iter()
            .any(|marker| source.contains(marker));
        let parameters = if source.contains(":person_name") {
            Parameters::from([
                (
                    "person_name".into(),
                    ParameterValue::String("Param Person".into()),
                ),
                ("person_age".into(), ParameterValue::Integer("41".into())),
            ])
        } else if source.contains(":from_id") {
            endpoints.clone()
        } else {
            Parameters::new()
        };
        let compiled = compile_source_with_parameters(source, Protocol::V2, &parameters);
        if invalid {
            assert!(compiled.is_err(), "expected validation error: {source}");
            continue;
        }
        let execution = execute_compiled(http, conn, &compiled.unwrap()).await;
        if source.contains("AtlasDemoRollback") && source.contains("BEGIN MUTATION") {
            assert!(
                matches!(
                    execution,
                    Err(AppError::Mutation {
                        outcome: "rolledBack",
                        ..
                    })
                ),
                "{source}: {execution:?}"
            );
        } else {
            let (result, _) = execution.unwrap_or_else(|e| panic!("{source}: {e}"));
            if endpoints.is_empty() {
                let result = serde_json::to_value(result).unwrap();
                endpoints.insert(
                    "from_id".into(),
                    ParameterValue::NodeId(
                        result["statements"][0]["ids"][0].as_str().unwrap().into(),
                    ),
                );
                endpoints.insert(
                    "to_id".into(),
                    ParameterValue::NodeId(
                        result["statements"][1]["ids"][0].as_str().unwrap().into(),
                    ),
                );
            }
        }
    }
    for (source, expected) in [
        ("SELECT COUNT(*) FROM NODES:AtlasDemoPerson", 4),
        ("SELECT COUNT(*) FROM NODES:AtlasDemoImported", 2),
        ("SELECT COUNT(*) FROM NODES:AtlasDemoTopic", 1),
        ("SELECT COUNT(*) FROM NODES:AtlasDemoRollback", 0),
        ("SELECT COUNT(*) FROM EDGES:AtlasDemoFollows", 5),
    ] {
        let (result, _) = execute_compiled(
            http,
            conn,
            &compile_source_for(source, Protocol::V2).unwrap(),
        )
        .await
        .unwrap();
        assert!(
            matches!(result, QueryResult::Count { value } if value == expected),
            "{source}: {result:?}"
        );
    }
}

#[test]
fn captured_mutation_sources_keep_the_verified_wire_contract() {
    let corpus: Value = serde_json::from_str(include_str!(
        "../../../contracts/helixdb-v2/helixsql-mutation-conformance.json"
    ))
    .unwrap();
    for fixture in corpus["fixtures"].as_array().unwrap() {
        let compiled =
            compile_source_for(fixture["source"].as_str().unwrap(), Protocol::V2).unwrap();
        if let Some(request) = fixture.get("request") {
            assert_eq!(
                &serde_json::from_str::<Value>(&compiled.transport_json).unwrap(),
                request
            );
        }
    }
}

#[test]
fn receipt_ids_use_raw_unsigned_terminals_including_the_full_range() {
    let source = "BEGIN MUTATION; INSERT INTO NODES:High AS a DEFAULT VALUES RETURNING *; INSERT INTO NODES:High AS b DEFAULT VALUES RETURNING id; INSERT INTO EDGES:HighEdge (source,target) VALUES (@a,@b) RETURNING *; COMMIT;";
    let compiled = compile_source_for(source, Protocol::V2).unwrap();
    let captured: Value = serde_json::from_str(include_str!(
        "../../../contracts/helixdb-v2/mutation-high-id-conformance.json"
    ))
    .unwrap();
    // Real seeded-server terminals, plus synthetic allocator boundary coverage.
    for (a, b, edge) in [
        (
            captured["response"]["aid"][0].as_u64().unwrap(),
            captured["response"]["bid"][0].as_u64().unwrap(),
            captured["response"]["eid"][0].as_u64().unwrap(),
        ),
        (0, u64::MAX, u64::MAX),
    ] {
        let mut body = json!({
            "s0_r0":[{"$id":i64::MAX,"id":"physical"}],"__s0_r0_ids":[a],"__s0_r0_labels":["High"],
            "s1_r0":[{}],"__s1_r0_ids":[b],"__s1_r0_labels":["High"],
            "s2_r0":[{"$id":i64::MAX,"source":"physical"}],"__s2_r0_ids":[edge],"__s2_r0_labels":["HighEdge"],"__s2_r0_from":[a],"__s2_r0_to":[b]
        });
        let result =
            serde_json::to_value(decode_compiled_response(&body.to_string(), &compiled).unwrap())
                .unwrap();
        assert_eq!(result["statements"][0]["entities"][0]["id"], a.to_string());
        assert_eq!(
            result["statements"][0]["entities"][0]["properties"]["id"],
            "physical"
        );
        assert_eq!(result["statements"][1]["rows"][0]["id"], b.to_string());
        assert_eq!(
            result["statements"][2]["entities"][0]["id"],
            edge.to_string()
        );
        assert_eq!(
            result["statements"][2]["entities"][0]["source"],
            a.to_string()
        );
        assert_eq!(
            result["statements"][2]["entities"][0]["target"],
            b.to_string()
        );
        body["__s2_r0_to"] = json!([]);
        assert!(decode_compiled_response(&body.to_string(), &compiled).is_err());
    }
}
