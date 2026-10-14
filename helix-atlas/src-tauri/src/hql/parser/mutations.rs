//! Mutation grammar reuses read columns, predicates, literals, and source spans.
use super::*;
use crate::hql::mutation::{
    self, ParsedInsert, ParsedMutation, ParsedStep, ParsedValue, ValueExpression,
};

fn mutation_keyword(word: &str) -> bool {
    is_keyword_word(word)
        || matches!(
            word,
            "INSERT"
                | "INTO"
                | "VALUES"
                | "DEFAULT"
                | "RETURNING"
                | "BEGIN"
                | "MUTATION"
                | "COMMIT"
                | "QUERY"
        )
}

impl Parser {
    pub(super) fn parse_binding_name(&mut self) -> Result<String, HqlError> {
        let token = self.peek(0);
        let valid = token.kind == TokenKind::Word
            && !token.quoted
            && !mutation_keyword(&token.upper)
            && token.text.bytes().enumerate().all(|(i, b)| {
                b == b'_' || b.is_ascii_alphabetic() || (i > 0 && b.is_ascii_digit())
            });
        if !valid {
            return Err(self.error_at(
                token,
                "expected an unquoted ASCII binding name (not a keyword)",
                None,
            ));
        }
        Ok(self.next().text)
    }

    pub(super) fn parse_mutation(mut self) -> Result<ParsedMutation, HqlError> {
        let result = self.parse_mutation_inner();
        result.map_err(|mut e| {
            if e.code.is_none() {
                e.code = Some("mutation_syntax");
            }
            e
        })
    }

    fn parse_mutation_inner(&mut self) -> Result<ParsedMutation, HqlError> {
        let block = self.take_keyword("BEGIN");
        let mut statements = Vec::new();
        if block {
            self.expect_keyword("MUTATION", "after BEGIN")?;
            self.expect_punct(';', "after BEGIN MUTATION")?;
            while !self.is_keyword("COMMIT") {
                if statements.len() >= mutation::MAX_STATEMENTS {
                    return Err(mutation::error(
                        "mutation_limit",
                        "a mutation may contain at most 100 statements",
                        Some(self.peek(0).span.clone()),
                    ));
                }
                let result = if self.is_keyword("SELECT") {
                    self.parse_lookup()
                } else {
                    self.parse_insert().map(ParsedStep::Insert)
                };
                statements.push(result.map_err(|mut e| {
                    e.statement_index = Some(statements.len());
                    e
                })?);
                self.expect_punct(';', "between mutation statements and before COMMIT")?;
            }
            self.next();
        } else {
            statements.push(ParsedStep::Insert(self.parse_insert()?));
        }
        self.take_punct(';');
        if !self.at_end() {
            return Err(self.error_at(
                self.peek(0),
                "unexpected trailing input",
                Some("wrap related inserts in BEGIN MUTATION; … COMMIT;"),
            ));
        }
        if !statements
            .iter()
            .any(|s| matches!(s, ParsedStep::Insert(_)))
        {
            return Err(mutation::error(
                "mutation_scope",
                "a mutation block must contain at least one insert",
                Some(self.peek(0).span.clone()),
            ));
        }
        Ok(ParsedMutation { block, statements })
    }

    fn parse_lookup(&mut self) -> Result<ParsedStep, HqlError> {
        let start = self
            .expect_keyword("SELECT", "at the start of a lookup")?
            .span;
        self.expect_punct(
            '*',
            "in a bound lookup (projections and DISTINCT are unsupported)",
        )?;
        self.expect_keyword("FROM", "after SELECT *")?;
        self.expect_keyword("NODES", "in a bound lookup")?;
        let label = if self.take_punct(':') {
            Some(self.parse_mutation_label()?)
        } else {
            None
        };
        let condition = if self.take_keyword("WHERE") {
            Some(self.parse_condition()?)
        } else {
            None
        };
        self.expect_keyword("AS", "after an exact node lookup (traversal, ordering, grouping, SKIP and LIMIT are unsupported)")?;
        let binding = self.parse_binding_name()?;
        let span = Span {
            end: self.tokens[self.position - 1].span.end,
            ..start
        };
        Ok(ParsedStep::Lookup {
            selection: Box::new(Selection {
                source: Source {
                    entity: EntityKind::Nodes,
                    label,
                    span: span.clone(),
                },
                condition,
                hops: Vec::new(),
                order_by: Vec::new(),
                skip: None,
                limit: None,
                distinct: false,
            }),
            binding,
            span,
        })
    }

    fn parse_mutation_label(&mut self) -> Result<String, HqlError> {
        let token = self.peek(0);
        if token.kind != TokenKind::Word
            || (!token.quoted && mutation_keyword(&token.upper))
            || token.text.is_empty()
        {
            return Err(self.error_at(
                token,
                "expected a nonempty label identifier",
                Some("use NODES:User or NODES:\"Research Group\""),
            ));
        }
        Ok(self.next().text)
    }

    fn parse_insert(&mut self) -> Result<ParsedInsert, HqlError> {
        let start = self
            .expect_keyword(
                "INSERT",
                "(nested blocks and standalone transaction commands are unsupported)",
            )?
            .span;
        self.expect_keyword("INTO", "after INSERT")?;
        let entity = if self.take_keyword("NODES") {
            EntityKind::Nodes
        } else {
            self.expect_keyword("EDGES", "after INSERT INTO")?;
            EntityKind::Edges
        };
        self.expect_punct(':', "before the mandatory label, for example NODES:User")?;
        let label = self.parse_mutation_label()?;
        let binding = if self.take_keyword("AS") {
            Some(self.parse_binding_name()?)
        } else {
            None
        };
        let mut columns = Vec::new();
        let mut rows = Vec::new();
        if self.take_keyword("DEFAULT") {
            self.expect_keyword("VALUES", "after DEFAULT")?;
            if entity == EntityKind::Edges {
                return Err(mutation::error("missing_endpoint", "edges require source and target columns; DEFAULT VALUES is only supported for nodes", Some(start)));
            }
            rows.push(Vec::new());
        } else {
            self.expect_punct('(', "before the explicit column list")?;
            loop {
                columns.push(self.parse_column()?);
                if !self.take_punct(',') {
                    break;
                }
            }
            self.expect_punct(')', "after the column list")?;
            self.expect_keyword("VALUES", "after the column list")?;
            loop {
                if rows.len() >= mutation::MAX_ROWS {
                    return Err(mutation::error(
                        "mutation_limit",
                        "a mutation may insert at most 1000 rows",
                        Some(self.peek(0).span.clone()),
                    ));
                }
                self.expect_punct('(', "before an input tuple")?;
                let mut row = Vec::new();
                loop {
                    let start = self.peek(0).span.clone();
                    let value = if self.take_punct('@') {
                        ValueExpression::Binding(self.parse_binding_name()?)
                    } else {
                        ValueExpression::Literal(self.parse_literal()?)
                    };
                    row.push(ParsedValue {
                        value,
                        span: Span {
                            end: self.tokens[self.position - 1].span.end,
                            ..start
                        },
                    });
                    if !self.take_punct(',') {
                        break;
                    }
                }
                self.expect_punct(')', "after an input tuple")?;
                rows.push(row);
                if !self.take_punct(',') {
                    break;
                }
            }
        }
        let returning = if self.take_keyword("RETURNING") {
            let projection = self.parse_projection()?;
            if matches!(projection, Projection::Count) {
                return Err(mutation::error(
                    "returning_projection",
                    "RETURNING does not support aggregates",
                    Some(self.tokens[self.position - 1].span.clone()),
                ));
            }
            Some(projection)
        } else {
            None
        };
        Ok(ParsedInsert {
            entity,
            label,
            binding,
            columns,
            rows,
            returning,
            span: Span {
                end: self.tokens[self.position - 1].span.end,
                ..start
            },
        })
    }
}
