//! Top-level read statements.

use super::Parser;
use crate::hql::lexer::{Numeric, TokenKind};
use crate::hql::{
    DescribeStatement, EntityKind, GraphStatement, HopDirection, HqlError, Projection,
    SelectStatement, Selection, ShowStatement, ShowTarget, Source,
};

impl Parser {
    pub(super) fn parse_select(&mut self) -> Result<SelectStatement, HqlError> {
        self.expect_keyword("SELECT", "at the start of the statement")?;
        let distinct = self.take_keyword("DISTINCT");
        let projection = self.parse_projection()?;
        self.expect_keyword("FROM", "after the select list")?;
        let source = self.parse_source()?;
        let condition = if self.take_keyword("WHERE") {
            Some(self.parse_condition()?)
        } else {
            None
        };
        let hops = self.parse_hops()?;
        let group_by = if self.take_keyword("GROUP") {
            self.expect_keyword("BY", "after GROUP")?;
            Some(self.parse_column()?)
        } else {
            None
        };
        let order_by = self.parse_order_by()?;
        let (skip, limit) = self.parse_paging()?;

        if let Some(column) = &group_by {
            if !matches!(projection, Projection::Count) {
                return Err(HqlError::new(
                    "GROUP BY is only supported with COUNT(*)",
                    Some(column.span.clone()),
                    Some("try: SELECT COUNT(*) FROM NODES GROUP BY label"),
                ));
            }
        }
        if matches!(projection, Projection::Count) && !order_by.is_empty() {
            return Err(HqlError::new(
                "ORDER BY cannot be combined with COUNT(*)",
                Some(order_by[0].column.span.clone()),
                Some("a count returns a single row"),
            ));
        }

        Ok(SelectStatement {
            projection,
            group_by,
            selection: Selection {
                source,
                condition,
                hops,
                order_by,
                skip,
                limit,
                distinct,
            },
        })
    }
    pub(super) fn parse_graph(&mut self) -> Result<GraphStatement, HqlError> {
        if !self.take_keyword("QUERY") {
            self.expect_keyword("GRAPH", "at the start of the statement")?;
        }
        let keyword_span = self.tokens[self.position - 1].span.clone();
        let source =
            if self.take_keyword("FROM") || self.is_keyword("NODES") || self.is_keyword("NODE") {
                self.parse_source()?
            } else {
                Source {
                    entity: EntityKind::Nodes,
                    label: None,
                    span: keyword_span,
                }
            };
        if source.entity != EntityKind::Nodes {
            return Err(HqlError::new(
                "QUERY selects nodes; edges are pulled in around them",
                Some(source.span.clone()),
                Some("use VIA <Label> to restrict which edges are drawn"),
            ));
        }
        let condition = if self.take_keyword("WHERE") {
            Some(self.parse_condition()?)
        } else {
            None
        };
        let hops = self.parse_hops()?;
        let edge_label = if self.take_keyword("VIA") {
            Some(self.parse_label("after VIA")?)
        } else {
            None
        };
        let mut with_properties = Vec::new();
        if self.take_keyword("WITH") {
            loop {
                with_properties.push(self.parse_column()?.name);
                if !self.take_punct(',') {
                    break;
                }
            }
        }
        let order_by = self.parse_order_by()?;
        let (skip, limit) = self.parse_paging()?;
        let max_edges = if self.is_keyword("EDGE") || self.is_keyword("EDGES") {
            self.next();
            self.expect_keyword("LIMIT", "after EDGE")?;
            Some(self.parse_count("EDGE LIMIT")?)
        } else {
            None
        };
        if let Some(last) = hops.last() {
            if matches!(
                last.direction,
                HopDirection::OutE | HopDirection::InE | HopDirection::BothE
            ) {
                return Err(HqlError::new(
                    "the last TRAVERSE of a QUERY must land on nodes",
                    Some(last.span.clone()),
                    Some("drop the EDGES keyword, or add TRAVERSE TARGET to step back onto nodes"),
                ));
            }
        }
        Ok(GraphStatement {
            selection: Selection {
                source,
                condition,
                hops,
                order_by,
                skip,
                limit,
                distinct: true,
            },
            with_properties,
            edge_label,
            max_edges,
        })
    }

    pub(super) fn parse_show(&mut self) -> Result<ShowStatement, HqlError> {
        self.expect_keyword("SHOW", "at the start of the statement")?;
        let target = if self.take_keyword("STATS") {
            ShowTarget::Stats
        } else if self.is_keyword("NODE") || self.is_keyword("NODES") {
            self.next();
            self.expect_keyword("LABELS", "after NODE")?;
            ShowTarget::NodeLabels
        } else if self.is_keyword("EDGE") || self.is_keyword("EDGES") {
            self.next();
            self.expect_keyword("LABELS", "after EDGE")?;
            ShowTarget::EdgeLabels
        } else if self.take_keyword("LABELS") {
            ShowTarget::Labels
        } else {
            return Err(self.error_at(
                self.peek(0),
                "expected LABELS, NODE LABELS, EDGE LABELS or STATS",
                Some("try: SHOW LABELS"),
            ));
        };
        let sample = if self.take_keyword("SAMPLE") {
            self.parse_count("SAMPLE")?
        } else {
            5_000
        };
        Ok(ShowStatement { target, sample })
    }

    pub(super) fn parse_describe(&mut self) -> Result<DescribeStatement, HqlError> {
        self.expect_keyword("DESCRIBE", "at the start of the statement")?;
        let entity = if self.is_keyword("NODE") || self.is_keyword("NODES") {
            EntityKind::Nodes
        } else if self.is_keyword("EDGE") || self.is_keyword("EDGES") {
            EntityKind::Edges
        } else {
            return Err(self.error_at(
                self.peek(0),
                "expected NODE or EDGE",
                Some("try: DESCRIBE NODE 42"),
            ));
        };
        self.next();
        let token = self.peek(0).clone();
        if !matches!(token.numeric, Some(Numeric::Integer(_))) && token.kind != TokenKind::String {
            return Err(self.error_at(
                &token,
                "expected a numeric entity id",
                Some("HelixDB IDs are unsigned 64-bit integers"),
            ));
        }
        let id = token.text.parse::<u64>().map_err(|_| {
            self.error_at(
                &token,
                "entity id must be an unsigned 64-bit integer",
                Some("IDs include zero and must not exceed 18446744073709551615"),
            )
        })?;
        self.next();
        let limit = if self.take_keyword("LIMIT") {
            self.parse_count("LIMIT")?
        } else {
            200
        };
        Ok(DescribeStatement {
            entity,
            id,
            id_span: token.span,
            limit,
        })
    }
}
