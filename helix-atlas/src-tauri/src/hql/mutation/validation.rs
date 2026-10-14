//! Bindings are resolved in statement order, independently of RETURNING columns.
use super::*;
use crate::hql::parameters::ParameterUse;
use std::collections::{BTreeMap, HashMap, HashSet};

pub(super) fn validate(
    parsed: ParsedMutation,
    resolver: &mut Resolver<'_>,
) -> Result<MutationPreview, HqlError> {
    let mut bindings = HashMap::new();
    let mut statements = Vec::with_capacity(parsed.statements.len());
    let mut nodes = 0;
    let mut edges = 0;
    for (index, step) in parsed.statements.into_iter().enumerate() {
        let validated =
            validate_step(step, index, parsed.block, &bindings, resolver).map_err(|mut e| {
                e.statement_index = Some(index);
                e
            })?;
        match &validated {
            PlannedStatement::Lookup { binding, span, .. } => {
                bind(&mut bindings, binding, index, span)?;
            }
            PlannedStatement::Insert {
                entity,
                rows,
                binding,
                span,
                ..
            } => {
                if *entity == "nodes" {
                    nodes += rows.len();
                } else {
                    edges += rows.len();
                }
                if nodes + edges > MAX_ROWS {
                    return Err(error(
                        "mutation_limit",
                        "a mutation may insert at most 1000 rows across all statements",
                        Some(span.clone()),
                    ));
                }
                if let Some(binding) = binding {
                    bind(&mut bindings, binding, index, span)?;
                }
            }
        }
        statements.push(validated);
    }
    let parameters = resolver.finish()?;
    Ok(MutationPreview {
        planned_nodes: nodes,
        planned_edges: edges,
        statements,
        parameters,
        executable: false,
        blocked_reason: String::new(),
    })
}

fn bind(
    bindings: &mut HashMap<String, usize>,
    name: &str,
    index: usize,
    span: &Span,
) -> Result<(), HqlError> {
    if bindings.insert(name.to_owned(), index).is_some() {
        let mut e = error(
            "duplicate_binding",
            format!("duplicate binding @{name}"),
            Some(span.clone()),
        );
        e.statement_index = Some(index);
        return Err(e);
    }
    Ok(())
}

fn validate_step(
    step: ParsedStep,
    index: usize,
    block: bool,
    bindings: &HashMap<String, usize>,
    resolver: &mut Resolver<'_>,
) -> Result<PlannedStatement, HqlError> {
    match step {
        ParsedStep::Lookup {
            mut selection,
            binding,
            span,
        } => {
            if let Some(condition) = &mut selection.condition {
                resolver.condition(condition)?;
            }
            let read = Statement::Select(SelectStatement {
                selection: (*selection).clone(),
                projection: Projection::Star,
                group_by: None,
            });
            validate_numbers(&read, Protocol::V2)?;
            // Validate the same v2 predicate limitations, with no implicit read row cap.
            let selection = super::super::v2::mutation_selection(&selection)?;
            Ok(PlannedStatement::Lookup {
                statement_index: index,
                binding,
                selection_json: serde_json::to_string(&selection)
                    .map_err(|e| HqlError::plain(e.to_string()))?,
                required_cardinality: 1,
                span,
            })
        }
        ParsedStep::Insert(insert) => validate_insert(insert, index, block, bindings, resolver),
    }
}

fn validate_insert(
    insert: ParsedInsert,
    index: usize,
    block: bool,
    bindings: &HashMap<String, usize>,
    resolver: &mut Resolver<'_>,
) -> Result<PlannedStatement, HqlError> {
    let fail = |code, message| error(code, message, Some(insert.span.clone()));
    if insert.binding.is_some()
        && (!block || insert.entity != EntityKind::Nodes || insert.rows.len() != 1)
    {
        return Err(fail(
            "binding_scope",
            "a binding must identify exactly one inserted node inside a mutation block",
        ));
    }
    let mut keys = HashSet::new();
    let mut source_column = None;
    let mut target_column = None;
    for (i, column) in insert.columns.iter().enumerate() {
        let endpoint = insert.entity == EntityKind::Edges
            && column.virtual_column
            && matches!(column.source.as_str(), "$from.$id" | "$to.$id");
        if endpoint {
            let slot = if column.source == "$from.$id" {
                &mut source_column
            } else {
                &mut target_column
            };
            if slot.replace(i).is_some() {
                return Err(error(
                    "duplicate_column",
                    "duplicate edge endpoint column",
                    Some(column.span.clone()),
                ));
            }
            // Explicit internal paths are never writable; only source/target spellings.
            if column.name.starts_with('$') {
                return Err(error(
                    "reserved_column",
                    "internal $ paths cannot be write columns",
                    Some(column.span.clone()),
                ));
            }
        } else {
            if column.virtual_column || column.source.starts_with('$') || column.source.is_empty() {
                return Err(error(
                    "reserved_column",
                    format!(
                        "{} is not a writable property; quote ordinary property names",
                        column.name
                    ),
                    Some(column.span.clone()),
                ));
            }
            if !keys.insert(&column.source) {
                return Err(error(
                    "duplicate_column",
                    format!("duplicate property column {}", column.name),
                    Some(column.span.clone()),
                ));
            }
        }
    }
    if insert.entity == EntityKind::Edges && (source_column.is_none() || target_column.is_none()) {
        return Err(fail(
            "missing_endpoint",
            "edges require exactly one unquoted source and one unquoted target column",
        ));
    }
    let returning = returning(insert.returning.as_ref(), insert.entity)?;
    let mut rows = Vec::with_capacity(insert.rows.len());
    for (tuple_index, values) in insert.rows.into_iter().enumerate() {
        let row = (|| {
            if values.len() != insert.columns.len() {
                return Err(error(
                    "tuple_width",
                    format!(
                        "expected {} values, found {}",
                        insert.columns.len(),
                        values.len()
                    ),
                    values
                        .first()
                        .map(|v| v.span.clone())
                        .or(Some(insert.span.clone())),
                ));
            }
            let mut row = PlannedRow {
                source: None,
                target: None,
                properties: BTreeMap::new(),
            };
            for (i, mut value) in values.into_iter().enumerate() {
                if Some(i) == source_column || Some(i) == target_column {
                    let endpoint = endpoint(&mut value, bindings, resolver)?;
                    if Some(i) == source_column {
                        row.source = Some(endpoint);
                    } else {
                        row.target = Some(endpoint);
                    }
                } else {
                    row.properties
                        .insert(insert.columns[i].source.clone(), property(value, resolver)?);
                }
            }
            Ok(row)
        })()
        .map_err(|mut e: HqlError| {
            e.tuple_index = Some(tuple_index);
            e
        })?;
        rows.push(row);
    }
    Ok(PlannedStatement::Insert {
        statement_index: index,
        entity: if insert.entity == EntityKind::Nodes {
            "nodes"
        } else {
            "edges"
        },
        label: insert.label,
        binding: insert.binding,
        rows,
        returning,
        span: insert.span,
    })
}

fn endpoint(
    value: &mut ParsedValue,
    bindings: &HashMap<String, usize>,
    resolver: &mut Resolver<'_>,
) -> Result<NodeReference, HqlError> {
    let fail = |code, message| error(code, message, Some(value.span.clone()));
    match &mut value.value {
        ValueExpression::Binding(name) => bindings
            .get(name)
            .copied()
            .map(NodeReference::Binding)
            .ok_or_else(|| {
                fail(
                    "unknown_binding",
                    format!("unknown or forward-referenced binding @{name}"),
                )
            }),
        ValueExpression::Literal(literal) => {
            resolver.resolve(literal, ParameterUse::NodeId)?;
            let Literal::Integer(text) = literal else {
                return Err(fail(
                    "endpoint_type",
                    "expected an unsigned node ID, nodeId parameter, or earlier @binding"
                        .to_owned(),
                ));
            };
            let id = text.parse::<u64>().map_err(|_| {
                fail(
                    "integer_range",
                    "node ID is outside the unsigned 64-bit range".to_owned(),
                )
            })?;
            Ok(NodeReference::Id(id.to_string()))
        }
    }
}

fn property(value: ParsedValue, resolver: &mut Resolver<'_>) -> Result<ParameterValue, HqlError> {
    let ValueExpression::Literal(mut literal) = value.value else {
        return Err(error(
            "binding_type",
            "node bindings can only be used as edge endpoints",
            Some(value.span),
        ));
    };
    resolver.resolve(&mut literal, ParameterUse::Property)?;
    Ok(match literal {
        Literal::Integer(text) => {
            text.parse::<i64>().map_err(|_| {
                error(
                    "integer_range",
                    "integer property is outside the signed 64-bit range",
                    Some(value.span),
                )
            })?;
            ParameterValue::Integer(text)
        }
        Literal::String(v) => ParameterValue::String(v),
        Literal::Float(v) => ParameterValue::Float(v),
        Literal::Boolean(v) => ParameterValue::Boolean(v),
        Literal::Null => ParameterValue::Null,
        Literal::Parameter { .. } => {
            return Err(error(
                "missing_parameter",
                "unresolved property parameter",
                Some(value.span),
            ))
        }
    })
}

fn returning(
    projection: Option<&Projection>,
    entity: EntityKind,
) -> Result<Option<Returning>, HqlError> {
    Ok(match projection {
        None => None,
        Some(Projection::Star) => Some(Returning::Entities),
        Some(Projection::Count) => {
            return Err(error(
                "returning_projection",
                "aggregates are unsupported in RETURNING",
                None,
            ))
        }
        Some(Projection::Columns(columns)) => {
            let mut output = Vec::with_capacity(columns.len());
            for column in columns {
                if column.virtual_column
                    && !matches!(
                        column.source.as_str(),
                        "$id" | "$label" | "$from.$id" | "$to.$id"
                    )
                {
                    return Err(error(
                        "returning_projection",
                        "RETURNING supports identity, label, edge endpoints and stored properties",
                        Some(column.span.clone()),
                    ));
                }
                if entity == EntityKind::Nodes
                    && column.virtual_column
                    && matches!(column.source.as_str(), "$from.$id" | "$to.$id")
                {
                    return Err(error(
                        "returning_projection",
                        "nodes have no source or target endpoint",
                        Some(column.span.clone()),
                    ));
                }
                output.push(ReturningColumn {
                    name: column.name.clone(),
                    source: column.source.clone(),
                    virtual_column: column.virtual_column,
                });
            }
            Some(Returning::Columns(output))
        }
    })
}
