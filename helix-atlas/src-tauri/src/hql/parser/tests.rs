use super::*;

fn select(source: &str) -> SelectStatement {
    match Parser::new(source).unwrap().parse().unwrap() {
        Statement::Select(statement) => statement,
        other => panic!("expected SELECT, got {other:?}"),
    }
}

#[test]
fn boolean_precedence_keeps_not_inside_and_inside_or() {
    let statement = select("SELECT * FROM NODES WHERE a = 1 OR b = 2 AND NOT c = 3");
    let Some(Condition::Or(parts)) = statement.selection.condition else {
        panic!("OR")
    };
    assert_eq!(parts.len(), 2);
    assert!(matches!(parts[0], Condition::Compare { .. }));
    let Condition::And(parts) = &parts[1] else {
        panic!("AND")
    };
    assert!(matches!(parts[1], Condition::Not(_)));
}

#[test]
fn parentheses_override_boolean_precedence() {
    let statement = select("SELECT * FROM NODES WHERE (a = 1 OR b = 2) AND c = 3");
    let Some(Condition::And(parts)) = statement.selection.condition else {
        panic!("AND")
    };
    assert!(matches!(parts[0], Condition::Or(_)));
    assert!(matches!(parts[1], Condition::Compare { .. }));
}

#[test]
fn quoted_metadata_names_remain_properties_and_aliases_remain_output_names() {
    let statement = select("SELECT id AS entity_id, \"id\" AS stored_id, \"label\" FROM NODES");
    let Projection::Columns(columns) = statement.projection else {
        panic!("columns")
    };
    assert_eq!(columns[0].name, "entity_id");
    assert_eq!(columns[0].source, "$id");
    assert!(columns[0].virtual_column);
    assert_eq!(columns[1].source, "id");
    assert!(!columns[1].virtual_column);
    assert_eq!(columns[2].source, "label");
    assert!(!columns[2].virtual_column);
}

#[test]
fn quoted_labels_and_escaped_strings_keep_unicode_and_case() {
    let statement =
        select("select name from nodes:\"Team \"\"Équipe\"\"\" where name = 'O''Brien 雪';");
    assert_eq!(
        statement.selection.source.label.as_deref(),
        Some("Team \"Équipe\"")
    );
    let Some(Condition::Compare {
        value: Literal::String(value),
        ..
    }) = statement.selection.condition
    else {
        panic!("string condition")
    };
    assert_eq!(value, "O'Brien 雪");
}

#[test]
fn comments_and_semicolon_are_accepted_without_allowing_a_second_statement() {
    let statement = select("-- before\nSELECT /* between\nlines */ * FROM NODES; -- after");
    assert_eq!(statement.selection.source.entity, EntityKind::Nodes);
    let error = Parser::new("SELECT * FROM NODES; SHOW STATS")
        .unwrap()
        .parse()
        .unwrap_err();
    assert!(error.message.contains("trailing input"));
    assert_eq!(error.hint.as_deref(), Some("only one statement per query"));
}

#[test]
fn pagination_accepts_both_orders_offset_alias_zero_and_unsigned_boundary() {
    for source in [
        "SELECT * FROM NODES SKIP 0 LIMIT 18446744073709551615",
        "SELECT * FROM NODES LIMIT 18446744073709551615 OFFSET 0",
    ] {
        let statement = select(source);
        assert_eq!(statement.selection.skip, Some(0));
        assert_eq!(statement.selection.limit, Some(u64::MAX));
    }
}

#[test]
fn malformed_statements_report_a_source_span() {
    for source in [
        "",
        "SELECT FROM NODES",
        "SELECT id, id FROM NODES",
        "SELECT id FROM NODES LIMIT -1",
        "SELECT * FROM NODES LIMIT 1.5",
        "SELECT * FROM NODES LIMIT 18446744073709551616",
        "SELECT * FROM NODES LIMIT 1 LIMIT 2",
        "SELECT * FROM NODES WHERE age IN ()",
        "SELECT * FROM NODES WHERE (age = 1",
        "SELECT * FROM NODES WHERE name NOT = 'x'",
        "SELECT * FROM NODES WHERE age = 1e",
        "SELECT COUNT(name) FROM NODES",
        "SELECT name FROM NODES GROUP BY name",
        "SELECT COUNT(*) FROM NODES ORDER BY name",
        "QUERY EDGES",
        "QUERY TRAVERSE OUT EDGES",
        "SHOW UNKNOWN",
        "DESCRIBE NODE -1",
        "DESCRIBE EDGE 1.5",
        "DESCRIBE NODE 18446744073709551616",
    ] {
        let error = Parser::new(source).unwrap().parse().unwrap_err();
        let span = error
            .span
            .unwrap_or_else(|| panic!("missing span for {source:?}"));
        assert!(span.start <= span.end, "{source:?}");
        assert!(span.end <= source.len(), "{source:?}");
        assert!(span.line >= 1 && span.column >= 1, "{source:?}");
    }
}

#[test]
fn lexer_rejects_unclosed_quotes_comments_and_invalid_numeric_tokens() {
    for source in [
        "SELECT 'unterminated",
        "SELECT \"unterminated",
        "SELECT `unterminated",
        "SELECT /* unterminated",
        "SELECT 1e999",
        "SELECT #",
    ] {
        let error = tokenize(source).unwrap_err();
        assert!(error.span.is_some(), "{source:?}");
    }
}

#[test]
fn between_consumes_its_and_without_breaking_the_outer_condition() {
    let statement = select("SELECT * FROM NODES WHERE age NOT BETWEEN 20 AND 30 AND active = true");
    let Some(Condition::And(parts)) = statement.selection.condition else {
        panic!("AND")
    };
    assert!(matches!(parts[0], Condition::Not(_)));
    assert!(matches!(
        parts[1],
        Condition::Compare {
            value: Literal::Boolean(true),
            ..
        }
    ));
}

#[test]
fn traversal_keeps_each_hops_label_and_condition() {
    let statement = select("SELECT * FROM NODES:User TRAVERSE OUT EDGES Follows WHERE weight > 0 TRAVERSE TARGET WHERE active = true ORDER BY name DESC, age ASC SKIP 2 LIMIT 10");
    let hops = statement.selection.hops;
    assert_eq!(hops.len(), 2);
    assert_eq!(hops[0].direction, HopDirection::OutE);
    assert_eq!(hops[0].label.as_deref(), Some("Follows"));
    assert!(hops[0].condition.is_some());
    assert_eq!(hops[1].direction, HopDirection::ToNode);
    assert!(hops[1].condition.is_some());
    assert!(statement.selection.order_by[0].descending);
    assert!(!statement.selection.order_by[1].descending);
}
