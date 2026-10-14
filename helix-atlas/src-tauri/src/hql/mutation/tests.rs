use super::*;

fn preview(source: &str) -> MutationPreview {
    compile_source_for(source, Protocol::V2)
        .unwrap()
        .mutation
        .unwrap()
}

#[test]
fn canonical_examples_compile_to_one_batch_with_materialized_creations() {
    let source = "BEGIN MUTATION;
        SELECT * FROM NODES:User WHERE name = 'Alice' AS alice;
        INSERT INTO NODES:User AS bob (name, age) VALUES ('Bob', 28) RETURNING id, name;
        INSERT INTO EDGES:Follows (source, target, since) VALUES (@alice, @bob, 2026) RETURNING id, source, target;
        COMMIT;";
    let compiled = compile_source_for(source, Protocol::V2).unwrap();
    let view = CompiledQueryView::from(&compiled);
    assert_eq!(view.execution_kind, "write");
    assert_eq!(view.transport_json.matches("\"add_n\"").count(), 1);
    assert_eq!(view.transport_json.matches("\"add_e\"").count(), 1);
    assert!(view.transport_json.contains("require_single_node"));
    let plan = compiled.mutation.unwrap();
    assert_eq!((plan.planned_nodes, plan.planned_edges), (1, 1));
    assert!(plan.executable);
    let PlannedStatement::Lookup {
        required_cardinality,
        selection_json,
        ..
    } = &plan.statements[0]
    else {
        panic!()
    };
    assert_eq!(*required_cardinality, 1);
    assert!(!selection_json.contains("limit"));
    let PlannedStatement::Insert { rows, .. } = &plan.statements[2] else {
        panic!()
    };
    assert!(matches!(rows[0].source, Some(NodeReference::Binding(0))));
    assert!(matches!(rows[0].target, Some(NodeReference::Binding(1))));
}

#[test]
fn examples_cover_default_bulk_quotes_null_and_case_sensitive_bindings() {
    for source in [
        "INSERT INTO NODES:User (name, age) VALUES ('Alice', 30) RETURNING id, name;",
        "INSERT INTO NODES:User (name, age) VALUES ('Alice', 30), ('Bob', 28), ('Cara', 35) RETURNING id, name;",
        "INSERT INTO NODES:Topic DEFAULT VALUES RETURNING *;",
        "INSERT INTO NODES:\"Research Group\" (\"display name\", \"id\") VALUES ('Graph systems', 'external-123') RETURNING id, \"id\" AS external_id;",
        "INSERT INTO EDGES:Follows (source, target, since) VALUES (42, 43, 2026) RETURNING id, label, source, target, since;",
        "INSERT INTO EDGES:Follows (source, target) VALUES (42, 43), (42, 44), (43, 44);",
        "INSERT INTO EDGES:ImportedFrom (target, source, \"source\") VALUES (43, 42, 'crm') RETURNING source, \"source\" AS import_source;",
        "BEGIN MUTATION; INSERT INTO NODES:User AS alice (name) VALUES ('Alice') RETURNING id; INSERT INTO NODES:User AS Alice DEFAULT VALUES; INSERT INTO EDGES:E (source, target) VALUES (@alice, @Alice), (@alice, @alice); COMMIT;",
        "/* 雪 */ insert into nodes:`Research Group` (`display name`, active, absent) values ('O''Brien', TRUE, NULL); -- done",
        "BEGIN MUTATION; SELECT * FROM NODES WHERE name = 'A' AS a; SELECT * FROM NODES WHERE name = 'B' AS b; INSERT INTO EDGES:E (source, target) VALUES (@b, @a), (@a, @b); COMMIT;",
    ] { assert!(preview(source).executable, "{source}"); }
    let p = preview("INSERT INTO NODES:N (x) VALUES (NULL)");
    let PlannedStatement::Insert { rows, .. } = &p.statements[0] else {
        panic!()
    };
    assert!(matches!(
        rows[0].properties.get("x"),
        Some(ParameterValue::Null)
    ));
}

#[test]
fn rejects_invalid_mutations_with_spans_and_stable_codes() {
    for source in [
        "INSERT INTO NODES (name) VALUES ('Alice')",
        "INSERT INTO NODES:N (a,b) VALUES (1)",
        "INSERT INTO NODES:N (a,\"a\") VALUES (1,2)",
        "INSERT INTO NODES:N (id) VALUES (1)",
        "INSERT INTO NODES:N (\"$id\") VALUES (1)",
        "INSERT INTO NODES:N ($label) VALUES ('x')",
        "INSERT INTO EDGES:E (\"source\", target) VALUES (1,2)",
        "INSERT INTO EDGES:E (source, SOURCE, target) VALUES (1,2,3)",
        "INSERT INTO EDGES:E (source, target) VALUES (42.5,2)",
        "INSERT INTO EDGES:E (source, target) VALUES (NULL,2)",
        "INSERT INTO EDGES:E (source, target) VALUES ('42',2)",
        "INSERT INTO EDGES:E (source, target) VALUES (@a,2)",
        "INSERT INTO EDGES:E ($from.$id, target) VALUES (1,2)",
        "INSERT INTO NODES:N AS a DEFAULT VALUES",
        "BEGIN MUTATION; INSERT INTO EDGES:E AS a (source,target) VALUES (1,2); COMMIT;",
        "BEGIN MUTATION; INSERT INTO NODES:N AS a (x) VALUES (1),(2); COMMIT;",
        "BEGIN MUTATION; INSERT INTO NODES:N AS a DEFAULT VALUES; SELECT * FROM NODES AS a; COMMIT;",
        "BEGIN MUTATION; SELECT * FROM NODES AS a; INSERT INTO NODES:N AS a DEFAULT VALUES; COMMIT;",
        "BEGIN MUTATION; INSERT INTO NODES:N (x) VALUES (@a); COMMIT;",
        "BEGIN MUTATION; SELECT * FROM NODES LIMIT 1 AS a; INSERT INTO NODES:N DEFAULT VALUES; COMMIT;",
        "BEGIN MUTATION; SELECT name FROM NODES AS a; INSERT INTO NODES:N DEFAULT VALUES; COMMIT;",
        "BEGIN MUTATION; SELECT DISTINCT * FROM NODES AS a; INSERT INTO NODES:N DEFAULT VALUES; COMMIT;",
        "BEGIN MUTATION; SELECT * FROM EDGES AS a; INSERT INTO NODES:N DEFAULT VALUES; COMMIT;",
        "BEGIN MUTATION; SELECT * FROM NODES AS a; COMMIT;",
        "BEGIN MUTATION; COMMIT;",
        "BEGIN MUTATION; BEGIN MUTATION; INSERT INTO NODES:N DEFAULT VALUES; COMMIT; COMMIT;",
        "BEGIN MUTATION; INSERT INTO NODES:N DEFAULT VALUES COMMIT;",
        "INSERT INTO NODES:N DEFAULT VALUES; INSERT INTO NODES:N DEFAULT VALUES;",
        "INSERT INTO NODES:N DEFAULT VALUES RETURNING COUNT(*)",
        "INSERT INTO NODES:N DEFAULT VALUES RETURNING id, \"id\"",
        "INSERT INTO NODES:N DEFAULT VALUES RETURNING source",
        "INSERT INTO NODES:N DEFAULT VALUES RETURNING score",
        "INSERT INTO NODES:N (x) VALUES ([1,2])",
        "BEGIN MUTATION; INSERT INTO NODES:N AS returning DEFAULT VALUES; COMMIT;",
    ] {
        let e = compile_source_for(source, Protocol::V2).unwrap_err();
        assert!(e.span.is_some(), "missing span: {source}: {e:?}");
        assert!(e.code.is_some() || source.contains('['), "missing code: {source}: {e:?}");
    }
}

#[test]
fn integer_ranges_are_exact_and_tuple_errors_identify_the_row() {
    for id in [
        "0",
        "9007199254740993",
        "9223372036854775808",
        "18446744073709551615",
    ] {
        let p = preview(&format!(
            "INSERT INTO EDGES:E (source,target) VALUES ({id},0)"
        ));
        let PlannedStatement::Insert { rows, .. } = &p.statements[0] else {
            panic!()
        };
        assert!(matches!(&rows[0].source, Some(NodeReference::Id(v)) if v == id));
    }
    for id in ["-1", "18446744073709551616"] {
        assert_eq!(
            compile_source_for(
                &format!("INSERT INTO EDGES:E (source,target) VALUES (0,0),({id},0)"),
                Protocol::V2
            )
            .unwrap_err()
            .tuple_index,
            Some(1)
        );
    }
    preview("INSERT INTO NODES:N (x) VALUES (-9223372036854775808), (9223372036854775807)");
    for value in ["-9223372036854775809", "9223372036854775808", "1e999"] {
        assert!(compile_source_for(
            &format!("INSERT INTO NODES:N (x) VALUES ({value})"),
            Protocol::V2
        )
        .is_err());
    }
}

#[test]
fn typed_parameters_cannot_be_reinterpreted_or_injected_as_source() {
    let parameters = Parameters::from([
        (
            "name".into(),
            ParameterValue::String("'); COMMIT; -- 雪".into()),
        ),
        (
            "from_id".into(),
            ParameterValue::NodeId("18446744073709551615".into()),
        ),
        (
            "age".into(),
            ParameterValue::Integer("9223372036854775807".into()),
        ),
    ]);
    let source = "BEGIN MUTATION; SELECT * FROM NODES WHERE id = :from_id AS a; INSERT INTO NODES:N AS b (name, age) VALUES (:name, :age); INSERT INTO EDGES:E (source,target) VALUES (@a,@b); COMMIT;";
    let compiled = compile_source_with_parameters(source, Protocol::V2, &parameters).unwrap();
    let p = compiled.mutation.unwrap();
    assert_eq!(p.parameters.len(), 3);
    let PlannedStatement::Lookup { selection_json, .. } = &p.statements[0] else {
        panic!()
    };
    let selection: Value = serde_json::from_str(selection_json).unwrap();
    assert_eq!(
        selection["nodes"]["reference"]["ids"][0].as_u64(),
        Some(u64::MAX)
    );
    let PlannedStatement::Insert { rows, .. } = &p.statements[1] else {
        panic!()
    };
    assert!(
        matches!(&rows[0].properties["name"], ParameterValue::String(v) if v == "'); COMMIT; -- 雪")
    );
    let source = "INSERT INTO EDGES:E (source,target,x) VALUES (:id,0,:id)";
    assert_eq!(
        compile_source_with_parameters(
            source,
            Protocol::V2,
            &Parameters::from([("id".into(), ParameterValue::NodeId("0".into()))])
        )
        .unwrap_err()
        .code,
        Some("parameter_type")
    );
    assert_eq!(
        compile_source_for("INSERT INTO NODES:N (x) VALUES (:missing)", Protocol::V2)
            .unwrap_err()
            .code,
        Some("missing_parameter")
    );
    assert!(compile_source_with_parameters(
        "INSERT INTO EDGES:E (source,target) VALUES (:id,0)",
        Protocol::V2,
        &Parameters::from([("id".into(), ParameterValue::Integer("1".into()))])
    )
    .is_err());
}

#[test]
fn parameters_in_compound_lookup_predicates_and_like_reuse_read_validation() {
    let source = "BEGIN MUTATION; SELECT * FROM NODES:User WHERE (age BETWEEN :low AND :high OR name IN (:name, 'x')) AND name LIKE :pattern AND NOT active = FALSE AS a; INSERT INTO NODES:N DEFAULT VALUES; COMMIT;";
    let values = Parameters::from([
        ("low".into(), ParameterValue::Integer("0".into())),
        ("high".into(), ParameterValue::Integer("100".into())),
        ("name".into(), ParameterValue::String("Alice".into())),
        ("pattern".into(), ParameterValue::String("A%".into())),
    ]);
    assert!(compile_source_with_parameters(source, Protocol::V2, &values).is_ok());
    // Ordinary read identifiers keep their earlier grammar.
    for protocol in [Protocol::LegacyV1, Protocol::V2] {
        assert!(compile_source_for("SELECT returning FROM NODES:Mutation", protocol).is_ok());
        assert!(compile_source_with_parameters(
            "SELECT * FROM NODES WHERE name LIKE :pattern",
            protocol,
            &Parameters::from([("pattern".into(), ParameterValue::String("A%".into()))])
        )
        .is_ok());
    }
}

#[test]
fn limits_are_atomic_and_legacy_preview_cannot_enable_execution() {
    let p = compile_source_for("INSERT INTO NODES:N DEFAULT VALUES", Protocol::LegacyV1).unwrap();
    assert!(p.mutation.unwrap().blocked_reason.contains("read-only"));
    let source = format!(
        "BEGIN MUTATION; {} COMMIT;",
        "INSERT INTO NODES:N DEFAULT VALUES;".repeat(101)
    );
    assert_eq!(
        compile_source_for(&source, Protocol::V2).unwrap_err().code,
        Some("mutation_limit")
    );
    let source = format!(
        "INSERT INTO NODES:N (x) VALUES {}",
        vec!["(0)"; 1001].join(",")
    );
    assert_eq!(
        compile_source_for(&source, Protocol::V2).unwrap_err().code,
        Some("mutation_limit")
    );
}
