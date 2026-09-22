export type DatabaseKind = "sqlite" | "postgres" | "mysql" | "sql-file"

export interface ColumnSchema {
  name: string
  dataType: string
  nullable: boolean
  primaryKey: boolean
  defaultValue: string | null
}

export interface ForeignKeySchema {
  name: string
  fromColumn: string
  toSchema: string | null
  toTable: string
  toColumn: string
}

export interface TableSchema {
  schema: string
  name: string
  kind: "table" | "view"
  rowCount: number | null
  columns: ColumnSchema[]
  foreignKeys: ForeignKeySchema[]
}

export interface DatabaseSchema {
  name: string
  dialect: DatabaseKind
  tables: TableSchema[]
  loadedAt: string
}

export interface ConnectionProfile {
  id: string
  name: string
  kind: DatabaseKind
  detail: string
  connected: boolean
  readOnly: boolean
}

export interface ConnectionInput {
  name: string
  kind: Exclude<DatabaseKind, "sql-file">
  url?: string
  path?: string
  readOnly: boolean
}

export interface QueryResult {
  columns: string[]
  rows: Array<Record<string, unknown>>
  affectedRows: number
  durationMs: number
  truncated: boolean
  message: string
}

export interface DatabaseValue {
  column: string
  dataType: string
  value: unknown
}

export interface UpdateCellInput {
  connectionId: string
  schema: string
  table: string
  column: string
  dataType: string
  value: unknown
  primaryKeys: DatabaseValue[]
}

export interface UpdateCellResult {
  affectedRows: number
}

export interface QueryHistoryItem {
  id: string
  sql: string
  executedAt: Date
  durationMs: number
  status: "success" | "error"
}

export type WorkspaceView = "diagram" | "data" | "query"
