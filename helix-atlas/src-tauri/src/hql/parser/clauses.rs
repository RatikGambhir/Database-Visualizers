//! Projection, source, traversal, ordering, and pagination clauses.

use super::{is_column_safe_keyword, is_keyword_word, make_column, Parser, DIRECTION_HINT};
use crate::hql::lexer::{Numeric, TokenKind};
use crate::hql::{
    ColumnRef, EntityKind, Hop, HopDirection, HqlError, OrderTerm, Projection, Source, Span,
};

impl Parser {
    pub(super) fn parse_projection(&mut self) -> Result<Projection, HqlError> {
        if self.take_punct('*') {
            return Ok(Projection::Star);
        }
        if self.is_keyword("COUNT")
            && self.peek(1).kind == TokenKind::Punct
            && self.peek(1).text == "("
        {
            self.next();
            self.expect_punct('(', "after COUNT")?;
            if !self.take_punct('*') {
                return Err(self.error_at(
                    self.peek(0),
                    "expected * inside COUNT",
                    Some("only COUNT(*) is supported; use GROUP BY to break the count down"),
                ));
            }
            self.expect_punct(')', "to close COUNT(*)")?;
            return Ok(Projection::Count);
        }

        let mut columns = Vec::new();
        loop {
            let mut column = self.parse_column()?;
            if self.take_keyword("AS") {
                column.name = self.parse_column()?.name;
            }
            if columns.iter().any(|c: &ColumnRef| c.name == column.name) {
                return Err(self.error_at(
                    self.peek(0),
                    "duplicate output column name",
                    Some("use AS to give metadata and stored properties distinct aliases"),
                ));
            }
            columns.push(column);
            if !self.take_punct(',') {
                break;
            }
        }
        Ok(Projection::Columns(columns))
    }

    pub(super) fn parse_column(&mut self) -> Result<ColumnRef, HqlError> {
        let token = self.peek(0).clone();
        if token.kind != TokenKind::Word {
            return Err(self.error_at(&token, "expected a column name", None));
        }
        if !token.quoted && is_keyword_word(&token.upper) && !is_column_safe_keyword(&token.upper) {
            let hint = if matches!(token.upper.as_str(), "FROM" | "TO") {
                "use source / target for an edge's endpoints".to_owned()
            } else {
                format!(
                    "quote it as \"{}\" to use it as a property name",
                    token.text
                )
            };
            return Err(self.error_at(
                &token,
                format!(
                    "expected a column name but {} is a keyword",
                    token.text.to_ascii_uppercase()
                ),
                Some(&hint),
            ));
        }
        self.next();

        if !token.quoted && token.text.starts_with('$') {
            let mut name = token.text.clone();
            let mut span = token.span.clone();
            while self.peek(0).kind == TokenKind::Punct
                && self.peek(0).text == "."
                && self.peek(1).kind == TokenKind::Word
            {
                self.next();
                let part = self.next();
                name.push('.');
                name.push_str(&part.text);
                span.end = part.span.end;
            }
            return Ok(ColumnRef {
                name: name.clone(),
                source: name,
                virtual_column: true,
                span,
            });
        }
        Ok(make_column(token.text, token.span, token.quoted))
    }

    pub(super) fn parse_source(&mut self) -> Result<Source, HqlError> {
        let token = self.peek(0).clone();
        let entity = if self.is_keyword("NODES") || self.is_keyword("NODE") {
            EntityKind::Nodes
        } else if self.is_keyword("EDGES") || self.is_keyword("EDGE") {
            EntityKind::Edges
        } else {
            return Err(self.error_at(
                &token,
                "expected NODES or EDGES",
                Some("try: SELECT * FROM NODES:User LIMIT 25"),
            ));
        };
        self.next();
        let label = if self.take_punct(':') {
            Some(self.parse_label("after ':'")?)
        } else if self.is_label_token() {
            Some(self.parse_label("after the source")?)
        } else {
            None
        };
        let end = self.tokens[self.position - 1].span.end;
        Ok(Source {
            entity,
            label,
            span: Span { end, ..token.span },
        })
    }

    fn is_label_token(&self) -> bool {
        let token = self.peek(0);
        token.kind == TokenKind::String
            || (token.kind == TokenKind::Word && (token.quoted || !is_keyword_word(&token.upper)))
    }

    pub(super) fn parse_label(&mut self, context: &str) -> Result<String, HqlError> {
        let token = self.peek(0).clone();
        if matches!(token.kind, TokenKind::String | TokenKind::Word) {
            if token.kind == TokenKind::Word && !token.quoted && is_keyword_word(&token.upper) {
                let hint = format!("quote it as \"{}\"", token.text);
                return Err(self.error_at(
                    &token,
                    format!(
                        "expected a label {context} but {} is a keyword",
                        token.text.to_ascii_uppercase()
                    ),
                    Some(&hint),
                ));
            }
            self.next();
            return Ok(token.text);
        }
        Err(self.error_at(&token, format!("expected a label {context}"), None))
    }

    pub(super) fn parse_hops(&mut self) -> Result<Vec<Hop>, HqlError> {
        let mut hops = Vec::new();
        while self.is_keyword("TRAVERSE") {
            let start = self.next().span;
            let direction = self.parse_hop_direction()?;
            let endpoint_hop = matches!(
                direction,
                HopDirection::FromNode | HopDirection::ToNode | HopDirection::OtherNode
            );
            let label = if !endpoint_hop && self.is_label_token() {
                Some(self.parse_label("after the direction")?)
            } else {
                None
            };
            let condition = if self.take_keyword("WHERE") {
                Some(self.parse_condition()?)
            } else {
                None
            };
            let end = self.tokens[self.position - 1].span.end;
            hops.push(Hop {
                direction,
                label,
                condition,
                span: Span { end, ..start },
            });
        }
        Ok(hops)
    }

    fn parse_hop_direction(&mut self) -> Result<HopDirection, HqlError> {
        let token = self.peek(0).clone();
        if token.kind != TokenKind::Word || token.quoted {
            return Err(self.error_at(
                &token,
                "expected a traversal direction",
                Some(DIRECTION_HINT),
            ));
        }
        if matches!(token.upper.as_str(), "OUT" | "IN" | "BOTH") {
            self.next();
            let to_edges = self.is_keyword("EDGES") || self.is_keyword("EDGE");
            if to_edges {
                self.next();
            }
            return Ok(match (token.upper.as_str(), to_edges) {
                ("OUT", false) => HopDirection::Out,
                ("OUT", true) => HopDirection::OutE,
                ("IN", false) => HopDirection::In,
                ("IN", true) => HopDirection::InE,
                ("BOTH", false) => HopDirection::Both,
                ("BOTH", true) => HopDirection::BothE,
                _ => unreachable!(),
            });
        }
        let direction = match token.upper.as_str() {
            "SOURCE" => HopDirection::FromNode,
            "TARGET" => HopDirection::ToNode,
            "OTHER" => HopDirection::OtherNode,
            _ => {
                return Err(self.error_at(
                    &token,
                    "expected a traversal direction",
                    Some(DIRECTION_HINT),
                ))
            }
        };
        self.next();
        Ok(direction)
    }

    pub(super) fn parse_order_by(&mut self) -> Result<Vec<OrderTerm>, HqlError> {
        if !self.take_keyword("ORDER") {
            return Ok(Vec::new());
        }
        self.expect_keyword("BY", "after ORDER")?;
        let mut terms = Vec::new();
        loop {
            let column = self.parse_column()?;
            let descending = if self.take_keyword("DESC") {
                true
            } else {
                self.take_keyword("ASC");
                false
            };
            terms.push(OrderTerm { column, descending });
            if !self.take_punct(',') {
                break;
            }
        }
        Ok(terms)
    }

    pub(super) fn parse_paging(&mut self) -> Result<(Option<u64>, Option<u64>), HqlError> {
        let mut skip = None;
        let mut limit = None;
        for _ in 0..2 {
            if (self.is_keyword("SKIP") || self.is_keyword("OFFSET")) && skip.is_none() {
                let keyword = self.next().upper;
                skip = Some(self.parse_count(&keyword)?);
                continue;
            }
            if self.is_keyword("LIMIT") && limit.is_none() {
                self.next();
                limit = Some(self.parse_count("LIMIT")?);
                continue;
            }
            break;
        }
        Ok((skip, limit))
    }

    pub(super) fn parse_count(&mut self, keyword: &str) -> Result<u64, HqlError> {
        let token = self.peek(0).clone();
        let Some(Numeric::Integer(ref value)) = token.numeric else {
            return Err(self.error_at(
                &token,
                format!("expected a whole number after {keyword}"),
                None,
            ));
        };
        let count = value.parse::<u64>().map_err(|_| {
            self.error_at(
                &token,
                format!("{keyword} must be an unsigned 64-bit integer"),
                None,
            )
        })?;
        self.next();
        Ok(count)
    }
}
