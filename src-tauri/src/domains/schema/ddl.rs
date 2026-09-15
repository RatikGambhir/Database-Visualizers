use std::collections::HashSet;

use regex::Regex;

use crate::domains::schema::models::{ColumnSchema, ForeignKeySchema, TableSchema};

pub fn parse_schema(sql: &str) -> Result<Vec<TableSchema>, String> {
    let block_comments = Regex::new(r"(?s)/\*.*?\*/").expect("valid regex");
    let line_comments = Regex::new(r"(?m)--[^\n]*$").expect("valid regex");
    let cleaned = line_comments
        .replace_all(&block_comments.replace_all(sql, ""), "")
        .into_owned();
    let mut tables = Vec::new();
    for statement in split_statements(&cleaned) {
        if let Some(table) = parse_create(&statement) {
            tables.push(table);
        }
    }
    tables.sort_by(|left, right| (&left.schema, &left.name).cmp(&(&right.schema, &right.name)));
    Ok(tables)
}

fn parse_create(statement: &str) -> Option<TableSchema> {
    let header = Regex::new(r#"(?is)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:["`\[]?[^\s.("`\]]+["`\]]?\.)?["`\[]?[^\s("`\]]+["`\]]?)"#).expect("valid regex");
    let captures = header.captures(statement)?;
    let kind = captures.get(1)?.as_str().to_ascii_lowercase();
    let (schema, name) = qualified_name(captures.get(2)?.as_str());
    if kind == "view" {
        return Some(TableSchema {
            schema,
            name,
            kind,
            row_count: None,
            columns: vec![],
            foreign_keys: vec![],
        });
    }

    let open = statement.find('(')?;
    let close = matching_paren(statement, open)?;
    let body = &statement[open + 1..close];
    let parts = split_top_level(body, ',');
    let primary_columns = table_primary_keys(&parts);
    let mut columns = Vec::new();
    let mut foreign_keys = table_foreign_keys(&parts, &schema, &name);

    for part in &parts {
        let trimmed = part.trim();
        let upper = trimmed.to_ascii_uppercase();
        if upper.starts_with("CONSTRAINT ")
            || upper.starts_with("PRIMARY KEY")
            || upper.starts_with("FOREIGN KEY")
            || upper.starts_with("UNIQUE ")
            || upper.starts_with("CHECK ")
            || upper.starts_with("EXCLUDE ")
        {
            continue;
        }
        let (column, inline_fk) = parse_column(trimmed, &schema, &name, &primary_columns)?;
        if let Some(foreign_key) = inline_fk {
            foreign_keys.push(foreign_key);
        }
        columns.push(column);
    }

    Some(TableSchema {
        schema,
        name,
        kind,
        row_count: None,
        columns,
        foreign_keys,
    })
}

fn parse_column(
    definition: &str,
    schema: &str,
    table: &str,
    primary_columns: &HashSet<String>,
) -> Option<(ColumnSchema, Option<ForeignKeySchema>)> {
    let (raw_name, rest) = take_identifier(definition)?;
    let name = clean_identifier(raw_name);
    let constraint = Regex::new(r"(?i)\s+(NOT\s+NULL|NULL|PRIMARY\s+KEY|REFERENCES|DEFAULT|UNIQUE|CHECK|COLLATE|CONSTRAINT|GENERATED)\b").expect("valid regex");
    let type_end = constraint
        .find(rest)
        .map(|found| found.start())
        .unwrap_or(rest.len());
    let data_type = rest[..type_end].trim().to_string();
    if data_type.is_empty() {
        return None;
    }

    let upper = rest.to_ascii_uppercase();
    let default_re = Regex::new(r"(?is)\bDEFAULT\s+(.+?)(?:\s+(?:NOT\s+NULL|NULL|PRIMARY|UNIQUE|REFERENCES|CHECK|COLLATE|CONSTRAINT|GENERATED)\b|$)").expect("valid regex");
    let default_value = default_re
        .captures(rest)
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string());
    let reference_re = Regex::new(r#"(?is)\bREFERENCES\s+(["`\[]?[\w$-]+["`\]]?(?:\s*\.\s*["`\[]?[\w$-]+["`\]]?)?)\s*\(\s*(["`\[]?[\w$-]+["`\]]?)\s*\)"#).expect("valid regex");
    let inline_fk = reference_re.captures(rest).map(|captures| {
        let (to_schema, to_table) = qualified_name(captures.get(1).expect("target").as_str());
        ForeignKeySchema {
            name: format!("fk_{table}_{name}"),
            from_column: name.clone(),
            to_schema: Some(if to_schema == "public" {
                schema.to_string()
            } else {
                to_schema
            }),
            to_table,
            to_column: clean_identifier(captures.get(2).expect("column").as_str()),
        }
    });

    Some((
        ColumnSchema {
            name: name.clone(),
            data_type,
            nullable: !upper.contains("NOT NULL")
                && !upper.contains("PRIMARY KEY")
                && !primary_columns.contains(&name),
            primary_key: upper.contains("PRIMARY KEY") || primary_columns.contains(&name),
            default_value,
        },
        inline_fk,
    ))
}

fn table_primary_keys(parts: &[String]) -> HashSet<String> {
    let regex = Regex::new(r"(?is)(?:CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)")
        .expect("valid regex");
    parts
        .iter()
        .filter_map(|part| regex.captures(part))
        .flat_map(|captures| {
            captures
                .get(1)
                .expect("columns")
                .as_str()
                .split(',')
                .map(|column| clean_identifier(column.trim()))
                .collect::<Vec<_>>()
        })
        .collect()
}

fn table_foreign_keys(parts: &[String], schema: &str, table: &str) -> Vec<ForeignKeySchema> {
    let regex = Regex::new(r#"(?is)(?:CONSTRAINT\s+(["`\[]?[\w$-]+["`\]]?)\s+)?FOREIGN\s+KEY\s*\(\s*(["`\[]?[\w$-]+["`\]]?)\s*\)\s*REFERENCES\s+(["`\[]?[\w$-]+["`\]]?(?:\s*\.\s*["`\[]?[\w$-]+["`\]]?)?)\s*\(\s*(["`\[]?[\w$-]+["`\]]?)\s*\)"#).expect("valid regex");
    parts
        .iter()
        .filter_map(|part| {
            let captures = regex.captures(part)?;
            let from_column = clean_identifier(captures.get(2)?.as_str());
            let (to_schema, to_table) = qualified_name(captures.get(3)?.as_str());
            Some(ForeignKeySchema {
                name: captures
                    .get(1)
                    .map(|value| clean_identifier(value.as_str()))
                    .unwrap_or_else(|| format!("fk_{table}_{from_column}")),
                from_column,
                to_schema: Some(if to_schema == "public" {
                    schema.to_string()
                } else {
                    to_schema
                }),
                to_table,
                to_column: clean_identifier(captures.get(4)?.as_str()),
            })
        })
        .collect()
}

fn qualified_name(value: &str) -> (String, String) {
    let parts = split_top_level(value, '.');
    if parts.len() > 1 {
        (
            clean_identifier(&parts[parts.len() - 2]),
            clean_identifier(&parts[parts.len() - 1]),
        )
    } else {
        ("public".into(), clean_identifier(value))
    }
}

fn clean_identifier(value: &str) -> String {
    value
        .trim()
        .trim_matches(|character| matches!(character, '"' | '`' | '[' | ']'))
        .to_string()
}

fn take_identifier(value: &str) -> Option<(&str, &str)> {
    let trimmed = value.trim_start();
    let first = trimmed.chars().next()?;
    if matches!(first, '"' | '`' | '[') {
        let closing = if first == '[' { ']' } else { first };
        let index = trimmed[1..].find(closing)? + 2;
        Some((&trimmed[..index], trimmed[index..].trim_start()))
    } else {
        let index = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
        Some((&trimmed[..index], trimmed[index..].trim_start()))
    }
}

fn split_statements(sql: &str) -> Vec<String> {
    split_top_level(sql, ';')
}

fn split_top_level(value: &str, delimiter: char) -> Vec<String> {
    let mut result = Vec::new();
    let mut start = 0;
    let mut depth = 0_i32;
    let mut quote: Option<char> = None;
    let chars: Vec<(usize, char)> = value.char_indices().collect();
    for (position, character) in chars {
        if let Some(active) = quote {
            if character == active || (active == ']' && character == ']') {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' | '`' => quote = Some(character),
            '[' => quote = Some(']'),
            '(' => depth += 1,
            ')' => depth -= 1,
            current if current == delimiter && depth == 0 => {
                if value[start..position].trim().len() > 0 {
                    result.push(value[start..position].trim().to_string());
                }
                start = position + character.len_utf8();
            }
            _ => {}
        }
    }
    if value[start..].trim().len() > 0 {
        result.push(value[start..].trim().to_string());
    }
    result
}

fn matching_paren(value: &str, open: usize) -> Option<usize> {
    let mut depth = 0_i32;
    let mut quote: Option<char> = None;
    for (position, character) in value[open..].char_indices() {
        if let Some(active) = quote {
            if character == active || (active == ']' && character == ']') {
                quote = None;
            }
            continue;
        }
        match character {
            '\'' | '"' | '`' => quote = Some(character),
            '[' => quote = Some(']'),
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(open + position);
                }
            }
            _ => {}
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::parse_schema;

    #[test]
    fn parses_columns_primary_keys_and_relationships() {
        let sql = r#"
          CREATE TABLE accounts (id UUID PRIMARY KEY, email VARCHAR(255) NOT NULL);
          CREATE TABLE orders (
            id BIGINT PRIMARY KEY,
            account_id UUID NOT NULL,
            total NUMERIC(10, 2) DEFAULT 0,
            CONSTRAINT orders_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id)
          );
        "#;
        let tables = parse_schema(sql).expect("schema");
        assert_eq!(tables.len(), 2);
        let orders = tables
            .iter()
            .find(|table| table.name == "orders")
            .expect("orders");
        assert_eq!(orders.columns.len(), 3);
        assert_eq!(orders.columns[2].data_type, "NUMERIC(10, 2)");
        assert_eq!(orders.foreign_keys[0].to_table, "accounts");
    }
}
