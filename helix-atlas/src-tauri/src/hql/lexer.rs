//! Exact tokenization and source spans. Integer tokens retain their text.
use super::*;
#[derive(Clone, Debug)]
pub(super) enum Numeric {
    Integer(String),
    Float(f64),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum TokenKind {
    Word,
    String,
    Number,
    Operator,
    Punct,
    Eof,
}

#[derive(Clone, Debug)]
pub(super) struct Token {
    pub(super) kind: TokenKind,
    pub(super) text: String,
    pub(super) upper: String,
    pub(super) numeric: Option<Numeric>,
    pub(super) quoted: bool,
    pub(super) span: Span,
}

pub(super) fn tokenize(source: &str) -> Result<Vec<Token>, HqlError> {
    let bytes = source.as_bytes();
    let mut tokens = Vec::new();
    let mut index = 0;
    let mut line = 1;
    let mut line_start = 0;

    let make_span = |start: usize, end: usize, start_line: usize, start_line_start: usize| Span {
        start,
        end,
        line: start_line,
        column: start - start_line_start + 1,
    };

    while index < bytes.len() {
        let byte = bytes[index];
        if byte == b'\n' {
            index += 1;
            line += 1;
            line_start = index;
            continue;
        }
        if matches!(byte, b' ' | b'\t' | b'\r') {
            index += 1;
            continue;
        }

        if byte == b'-' && bytes.get(index + 1) == Some(&b'-') {
            while index < bytes.len() && bytes[index] != b'\n' {
                index += 1;
            }
            continue;
        }
        if byte == b'/' && bytes.get(index + 1) == Some(&b'*') {
            let start = index;
            let start_line = line;
            let start_line_start = line_start;
            index += 2;
            while index + 1 < bytes.len() && !(bytes[index] == b'*' && bytes[index + 1] == b'/') {
                if bytes[index] == b'\n' {
                    line += 1;
                    line_start = index + 1;
                }
                index += 1;
            }
            if index + 1 >= bytes.len() {
                return Err(HqlError::new(
                    "unterminated block comment",
                    Some(make_span(start, index, start_line, start_line_start)),
                    None,
                ));
            }
            index += 2;
            continue;
        }

        let start = index;
        let start_line = line;
        let start_line_start = line_start;

        if byte == b'\'' {
            index += 1;
            let mut value = String::new();
            loop {
                if index >= bytes.len() {
                    return Err(HqlError::new(
                        "unterminated string literal",
                        Some(make_span(start, index, start_line, start_line_start)),
                        Some("add a closing '"),
                    ));
                }
                if bytes[index] == b'\'' {
                    if bytes.get(index + 1) == Some(&b'\'') {
                        value.push('\'');
                        index += 2;
                        continue;
                    }
                    index += 1;
                    break;
                }
                let ch = source[index..]
                    .chars()
                    .next()
                    .expect("valid UTF-8 boundary");
                if ch == '\n' {
                    line += 1;
                    line_start = index + 1;
                }
                value.push(ch);
                index += ch.len_utf8();
            }
            tokens.push(Token {
                kind: TokenKind::String,
                upper: value.to_uppercase(),
                text: value,
                numeric: None,
                quoted: false,
                span: make_span(start, index, start_line, start_line_start),
            });
            continue;
        }

        if byte == b'"' || byte == b'`' {
            let quote = byte;
            index += 1;
            let mut value = String::new();
            loop {
                if index >= bytes.len() || bytes[index] == b'\n' {
                    return Err(HqlError::new(
                        "unterminated quoted identifier",
                        Some(make_span(start, index, start_line, start_line_start)),
                        Some(if quote == b'"' {
                            "add a closing \""
                        } else {
                            "add a closing `"
                        }),
                    ));
                }
                if bytes[index] == quote {
                    // SQL-style doubled quote escapes the quote in an identifier.
                    if bytes.get(index + 1) == Some(&quote) {
                        value.push(quote as char);
                        index += 2;
                        continue;
                    }
                    index += 1;
                    break;
                }
                let ch = source[index..]
                    .chars()
                    .next()
                    .expect("valid UTF-8 boundary");
                value.push(ch);
                index += ch.len_utf8();
            }
            tokens.push(Token {
                kind: TokenKind::Word,
                text: value,
                upper: String::new(),
                numeric: None,
                quoted: true,
                span: make_span(start, index, start_line, start_line_start),
            });
            continue;
        }

        let next_is_digit = bytes.get(index + 1).is_some_and(u8::is_ascii_digit);
        if byte.is_ascii_digit() || (byte == b'-' && next_is_digit) {
            if byte == b'-' {
                index += 1;
            }
            while bytes.get(index).is_some_and(u8::is_ascii_digit) {
                index += 1;
            }
            let mut is_float = false;
            if bytes.get(index) == Some(&b'.')
                && bytes.get(index + 1).is_some_and(u8::is_ascii_digit)
            {
                is_float = true;
                index += 1;
                while bytes.get(index).is_some_and(u8::is_ascii_digit) {
                    index += 1;
                }
            }
            if matches!(bytes.get(index), Some(b'e' | b'E')) {
                let save = index;
                index += 1;
                if matches!(bytes.get(index), Some(b'+' | b'-')) {
                    index += 1;
                }
                if bytes.get(index).is_some_and(u8::is_ascii_digit) {
                    is_float = true;
                    while bytes.get(index).is_some_and(u8::is_ascii_digit) {
                        index += 1;
                    }
                } else {
                    index = save;
                }
            }
            let text = &source[start..index];
            let numeric = if is_float {
                let value = text.parse::<f64>().map_err(|_| {
                    HqlError::new(
                        "invalid numeric literal",
                        Some(make_span(start, index, start_line, start_line_start)),
                        None,
                    )
                })?;
                if !value.is_finite() {
                    return Err(HqlError::new(
                        "numeric literal is outside the supported range",
                        Some(make_span(start, index, start_line, start_line_start)),
                        None,
                    ));
                }
                Numeric::Float(value)
            } else {
                Numeric::Integer(text.to_owned())
            };
            tokens.push(Token {
                kind: TokenKind::Number,
                text: text.to_owned(),
                upper: text.to_owned(),
                numeric: Some(numeric),
                quoted: false,
                span: make_span(start, index, start_line, start_line_start),
            });
            continue;
        }

        if is_ident_start(byte) {
            index += 1;
            while bytes.get(index).is_some_and(|value| is_ident_part(*value)) {
                index += 1;
            }
            let text = &source[start..index];
            tokens.push(Token {
                kind: TokenKind::Word,
                text: text.to_owned(),
                upper: text.to_ascii_uppercase(),
                numeric: None,
                quoted: false,
                span: make_span(start, index, start_line, start_line_start),
            });
            continue;
        }

        let operator = [">=", "<=", "!=", "<>", "=", ">", "<"]
            .into_iter()
            .find(|operator| source[index..].starts_with(operator));
        if let Some(operator) = operator {
            index += operator.len();
            tokens.push(Token {
                kind: TokenKind::Operator,
                text: operator.to_owned(),
                upper: operator.to_owned(),
                numeric: None,
                quoted: false,
                span: make_span(start, index, start_line, start_line_start),
            });
            continue;
        }

        if matches!(byte, b'(' | b')' | b',' | b'*' | b'.' | b':' | b';') {
            index += 1;
            let text = (byte as char).to_string();
            tokens.push(Token {
                kind: TokenKind::Punct,
                upper: text.clone(),
                text,
                numeric: None,
                quoted: false,
                span: make_span(start, index, start_line, start_line_start),
            });
            continue;
        }

        let ch = source[index..]
            .chars()
            .next()
            .expect("valid UTF-8 boundary");
        index += ch.len_utf8();
        return Err(HqlError::new(
            format!("unexpected character {ch:?}"),
            Some(make_span(start, index, start_line, start_line_start)),
            None,
        ));
    }

    tokens.push(Token {
        kind: TokenKind::Eof,
        text: String::new(),
        upper: String::new(),
        numeric: None,
        quoted: false,
        span: Span {
            start: source.len(),
            end: source.len(),
            line,
            column: source.len() - line_start + 1,
        },
    });
    Ok(tokens)
}

fn is_ident_start(value: u8) -> bool {
    value.is_ascii_alphabetic() || matches!(value, b'_' | b'$')
}

fn is_ident_part(value: u8) -> bool {
    value.is_ascii_alphanumeric() || matches!(value, b'_' | b'$')
}
