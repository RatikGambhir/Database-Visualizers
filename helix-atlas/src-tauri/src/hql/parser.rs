//! HelixSQL read grammar.
use super::lexer::{tokenize, Token, TokenKind};
use super::*;
mod clauses;
mod expressions;
mod statements;
#[cfg(test)]
mod tests;

pub(super) struct Parser {
    tokens: Vec<Token>,
    position: usize,
}

impl Parser {
    pub(super) fn new(source: &str) -> Result<Self, HqlError> {
        Ok(Self {
            tokens: tokenize(source)?,
            position: 0,
        })
    }

    fn peek(&self, offset: usize) -> &Token {
        &self.tokens[(self.position + offset).min(self.tokens.len() - 1)]
    }

    fn next(&mut self) -> Token {
        let token = self.peek(0).clone();
        if token.kind != TokenKind::Eof {
            self.position += 1;
        }
        token
    }

    fn at_end(&self) -> bool {
        self.peek(0).kind == TokenKind::Eof
    }

    fn is_keyword(&self, word: &str) -> bool {
        let token = self.peek(0);
        token.kind == TokenKind::Word && !token.quoted && token.upper == word
    }

    fn take_keyword(&mut self, word: &str) -> bool {
        if !self.is_keyword(word) {
            return false;
        }
        self.position += 1;
        true
    }

    fn expect_keyword(&mut self, word: &str, context: &str) -> Result<Token, HqlError> {
        if !self.is_keyword(word) {
            return Err(self.error_at(self.peek(0), format!("expected {word} {context}"), None));
        }
        Ok(self.next())
    }

    fn take_punct(&mut self, value: char) -> bool {
        let token = self.peek(0);
        if token.kind == TokenKind::Punct && token.text == value.to_string() {
            self.position += 1;
            return true;
        }
        false
    }

    fn expect_punct(&mut self, value: char, context: &str) -> Result<Token, HqlError> {
        if !self.take_punct(value) {
            return Err(self.error_at(self.peek(0), format!("expected {value:?} {context}"), None));
        }
        Ok(self.tokens[self.position - 1].clone())
    }

    fn error_at(&self, token: &Token, message: impl Into<String>, hint: Option<&str>) -> HqlError {
        let found = if token.kind == TokenKind::Eof {
            "end of query".to_owned()
        } else {
            format!("{:?}", token.text)
        };
        HqlError::new(
            format!("{}, found {found}", message.into()),
            Some(token.span.clone()),
            hint,
        )
    }

    pub(super) fn parse(mut self) -> Result<Statement, HqlError> {
        if self.at_end() {
            return Err(HqlError::new(
                "empty query",
                Some(self.peek(0).span.clone()),
                Some("try: SELECT * FROM NODES LIMIT 25"),
            ));
        }

        let statement = if self.is_keyword("SELECT") {
            Statement::Select(self.parse_select()?)
        } else if self.is_keyword("QUERY") || self.is_keyword("GRAPH") {
            Statement::Graph(self.parse_graph()?)
        } else if self.is_keyword("SHOW") {
            Statement::Show(self.parse_show()?)
        } else if self.is_keyword("DESCRIBE") {
            Statement::Describe(self.parse_describe()?)
        } else {
            return Err(self.error_at(
                self.peek(0),
                "expected a statement (SELECT, QUERY, SHOW or DESCRIBE)",
                Some("HelixSQL is read-only; writes must go through a HelixDB SDK"),
            ));
        };

        self.take_punct(';');
        if !self.at_end() {
            return Err(self.error_at(
                self.peek(0),
                "unexpected trailing input",
                Some("only one statement per query"),
            ));
        }
        Ok(statement)
    }
}

const DIRECTION_HINT: &str = "one of OUT, IN, BOTH (to nodes), OUT EDGES, IN EDGES, BOTH EDGES (to edges), SOURCE, TARGET, OTHER (edge to node)";

pub(crate) fn is_keyword_word(word: &str) -> bool {
    matches!(
        word,
        "SELECT"
            | "AS"
            | "DISTINCT"
            | "FROM"
            | "WHERE"
            | "TRAVERSE"
            | "ORDER"
            | "BY"
            | "ASC"
            | "DESC"
            | "LIMIT"
            | "SKIP"
            | "OFFSET"
            | "GROUP"
            | "AND"
            | "OR"
            | "NOT"
            | "IN"
            | "IS"
            | "NULL"
            | "LIKE"
            | "BETWEEN"
            | "HAS"
            | "COUNT"
            | "TRUE"
            | "FALSE"
            | "NODES"
            | "EDGES"
            | "NODE"
            | "EDGE"
            | "GRAPH"
            | "SHOW"
            | "DESCRIBE"
            | "LABELS"
            | "STATS"
            | "SAMPLE"
            | "WITH"
            | "VIA"
            | "OUT"
            | "BOTH"
            | "SOURCE"
            | "TARGET"
            | "OTHER"
    )
}

fn is_column_safe_keyword(word: &str) -> bool {
    matches!(word, "SOURCE" | "TARGET" | "LABELS" | "STATS")
}

fn make_column(name: String, span: Span, quoted: bool) -> ColumnRef {
    let virtual_source = if !quoted {
        match name.to_ascii_lowercase().as_str() {
            "id" => Some("$id"),
            "label" => Some("$label"),
            "source" => Some("$from.$id"),
            "target" => Some("$to.$id"),
            "score" => Some("$score"),
            "distance" => Some("$distance"),
            _ => None,
        }
    } else {
        None
    };
    ColumnRef {
        source: virtual_source.unwrap_or(&name).to_owned(),
        virtual_column: virtual_source.is_some(),
        name,
        span,
    }
}
