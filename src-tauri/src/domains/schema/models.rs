use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnSchema {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub primary_key: bool,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeySchema {
    pub name: String,
    pub from_column: String,
    pub to_schema: Option<String>,
    pub to_table: String,
    pub to_column: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableSchema {
    pub schema: String,
    pub name: String,
    pub kind: String,
    pub row_count: Option<i64>,
    pub columns: Vec<ColumnSchema>,
    pub foreign_keys: Vec<ForeignKeySchema>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSchema {
    pub name: String,
    pub dialect: String,
    pub tables: Vec<TableSchema>,
    pub loaded_at: String,
}
