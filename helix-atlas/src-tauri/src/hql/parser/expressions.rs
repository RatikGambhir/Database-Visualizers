//! Boolean conditions and literal values.

use super::Parser;
use crate::hql::lexer::{Numeric, TokenKind};
use crate::hql::{ComparisonOperator, Condition, HqlError, Literal};

impl Parser {
    pub(super) fn parse_condition(&mut self) -> Result<Condition, HqlError> {
        self.parse_or()
    }

    fn parse_or(&mut self) -> Result<Condition, HqlError> {
        let mut parts = vec![self.parse_and()?];
        while self.take_keyword("OR") {
            parts.push(self.parse_and()?);
        }
        Ok(if parts.len() == 1 {
            parts.remove(0)
        } else {
            Condition::Or(parts)
        })
    }

    fn parse_and(&mut self) -> Result<Condition, HqlError> {
        let mut parts = vec![self.parse_not()?];
        while self.take_keyword("AND") {
            parts.push(self.parse_not()?);
        }
        Ok(if parts.len() == 1 {
            parts.remove(0)
        } else {
            Condition::And(parts)
        })
    }

    fn parse_not(&mut self) -> Result<Condition, HqlError> {
        if self.take_keyword("NOT") {
            return Ok(Condition::Not(Box::new(self.parse_not()?)));
        }
        self.parse_primary_condition()
    }

    fn parse_primary_condition(&mut self) -> Result<Condition, HqlError> {
        if self.take_punct('(') {
            let inner = self.parse_condition()?;
            self.expect_punct(')', "to close the group")?;
            return Ok(inner);
        }
        if self.is_keyword("HAS")
            && self.peek(1).kind == TokenKind::Punct
            && self.peek(1).text == "("
        {
            self.next();
            self.expect_punct('(', "after HAS")?;
            let column = self.parse_column()?;
            self.expect_punct(')', "to close HAS(...)")?;
            return Ok(Condition::Has(column));
        }

        let column = self.parse_column()?;
        if self.take_keyword("IS") {
            let negated = self.take_keyword("NOT");
            self.expect_keyword("NULL", "after IS")?;
            return Ok(Condition::IsNull { column, negated });
        }
        let negated = self.take_keyword("NOT");
        if self.take_keyword("IN") {
            self.expect_punct('(', "after IN")?;
            let mut values = Vec::new();
            if !self.take_punct(')') {
                loop {
                    values.push(self.parse_literal()?);
                    if !self.take_punct(',') {
                        break;
                    }
                }
                self.expect_punct(')', "to close the IN list")?;
            }
            if values.is_empty() {
                return Err(HqlError::new(
                    "IN needs at least one value",
                    Some(column.span.clone()),
                    None,
                ));
            }
            return Ok(Condition::In {
                column,
                values,
                negated,
            });
        }
        if self.take_keyword("LIKE") {
            let token = self.peek(0).clone();
            if token.kind != TokenKind::String {
                return Err(self.error_at(
                    &token,
                    "expected a quoted pattern after LIKE",
                    Some("for example: LIKE 'ali%'"),
                ));
            }
            self.next();
            return Ok(Condition::Like {
                column,
                pattern: token.text,
                negated,
            });
        }
        if self.take_keyword("BETWEEN") {
            let low = self.parse_literal()?;
            self.expect_keyword("AND", "between the BETWEEN bounds")?;
            let high = self.parse_literal()?;
            let condition = Condition::Between { column, low, high };
            return Ok(if negated {
                Condition::Not(Box::new(condition))
            } else {
                condition
            });
        }
        if negated {
            return Err(self.error_at(
                self.peek(0),
                "expected IN, LIKE or BETWEEN after NOT",
                None,
            ));
        }

        let operator_token = self.peek(0).clone();
        if operator_token.kind != TokenKind::Operator {
            return Err(self.error_at(
                &operator_token,
                "expected a comparison operator",
                Some("one of =, !=, >, >=, <, <=, IN, LIKE, BETWEEN, IS NULL"),
            ));
        }
        self.next();
        let operator = match operator_token.text.as_str() {
            "=" => ComparisonOperator::Eq,
            "!=" | "<>" => ComparisonOperator::Neq,
            ">" => ComparisonOperator::Gt,
            ">=" => ComparisonOperator::Gte,
            "<" => ComparisonOperator::Lt,
            "<=" => ComparisonOperator::Lte,
            _ => unreachable!(),
        };
        Ok(Condition::Compare {
            column,
            operator,
            value: self.parse_literal()?,
        })
    }

    fn parse_literal(&mut self) -> Result<Literal, HqlError> {
        let token = self.peek(0).clone();
        if token.kind == TokenKind::String {
            self.next();
            return Ok(Literal::String(token.text));
        }
        if token.kind == TokenKind::Number {
            self.next();
            return Ok(match token.numeric.expect("number token") {
                Numeric::Integer(value) => Literal::Integer(value),
                Numeric::Float(value) => Literal::Float(value),
            });
        }
        if token.kind == TokenKind::Word && !token.quoted {
            match token.upper.as_str() {
                "TRUE" => {
                    self.next();
                    return Ok(Literal::Boolean(true));
                }
                "FALSE" => {
                    self.next();
                    return Ok(Literal::Boolean(false));
                }
                "NULL" => {
                    self.next();
                    return Ok(Literal::Null);
                }
                _ => {}
            }
        }
        Err(self.error_at(
            &token,
            "expected a literal value",
            Some("strings use single quotes: WHERE name = 'Alice'"),
        ))
    }
}
