use super::lexer::{tokenize, Numeric};
use super::*;

fn compile(source: &str) -> CompiledQuery {
    compile_source(source).unwrap()
}

fn wire(source: &str) -> Value {
    serde_json::from_str(&compile(source).transport_json).unwrap()
}

#[test]
fn lexer_preserves_i64_and_reports_spans() {
    let tokens = tokenize("SELECT 'it''s' -- comment\n9223372036854775807").unwrap();
    assert_eq!(tokens[1].text, "it's");
    assert!(matches!(
        tokens[2].numeric,
        Some(Numeric::Integer(ref value)) if value == "9223372036854775807"
    ));
    let error = tokenize("SELECT *\nFROM 'unterminated").unwrap_err();
    assert_eq!(error.span.unwrap().line, 2);
}

#[test]
fn parses_all_statement_families() {
    assert!(matches!(
        Parser::new("SELECT * FROM NODES").unwrap().parse(),
        Ok(Statement::Select(_))
    ));
    assert!(matches!(
        Parser::new("QUERY NODES:User LIMIT 5").unwrap().parse(),
        Ok(Statement::Graph(_))
    ));
    assert!(matches!(
        Parser::new("GRAPH").unwrap().parse(),
        Ok(Statement::Graph(_))
    ));
    assert!(matches!(
        Parser::new("SHOW STATS").unwrap().parse(),
        Ok(Statement::Show(_))
    ));
    assert!(matches!(
        Parser::new("DESCRIBE NODE 42").unwrap().parse(),
        Ok(Statement::Describe(_))
    ));
}

#[test]
fn rejects_malformed_inserts_and_invalid_traversals() {
    assert!(compile_source("INSERT INTO NODES VALUES (1)")
        .unwrap_err()
        .message
        .contains("mandatory label"));
    assert!(compile_source("SELECT id FROM EDGES TRAVERSE OUT")
        .unwrap_err()
        .message
        .contains("starts from a node"));
    assert!(compile_source("QUERY NODES TRAVERSE OUT EDGES")
        .unwrap_err()
        .message
        .contains("must land on nodes"));
}

#[test]
fn compiles_exact_large_integers_and_expected_envelope() {
    let compiled = compile("SELECT id FROM NODES WHERE externalId = 9223372036854775807");
    assert!(compiled.transport_json.contains("9223372036854775807"));
    let value = wire("SELECT * FROM NODES");
    assert_eq!(value["request_type"], "read");
    assert_eq!(value["query_name"], "helix_visualizer_select_star");
}

#[test]
fn graph_limits_apply_before_edge_fanout() {
    let value = wire("QUERY LIMIT 25 EDGE LIMIT 90");
    let queries = value["query"]["queries"].as_array().unwrap();
    let edges = &queries[1]["Query"]["steps"];
    assert_eq!(edges[2], json!({ "Limit": 25 }));
    assert_eq!(edges[5], json!({ "Limit": 90 }));
}

#[test]
fn validates_like_patterns_and_null_virtuals() {
    assert!(compile_source("SELECT id FROM NODES WHERE name LIKE 'a%e%'").is_err());
    assert!(compile_source("SELECT id FROM NODES WHERE id IS NULL").is_err());
    assert!(compile_source("SELECT id FROM NODES WHERE bio IS NULL").is_ok());
}

#[test]
fn splash_preview_is_valid_hql() {
    let source = "QUERY NODES:User\nWHERE active = true\nTRAVERSE OUT Follows\nWITH name, email\nORDER BY name ASC\nLIMIT 150  EDGE LIMIT 600";
    let compiled = compile_source(source).unwrap();
    assert!(matches!(
        compiled.shape,
        ResultShape::Graph {
            node_limit: 150,
            edge_limit: 600,
            ..
        }
    ));
}
