import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import type { ConnectionInput, ConnectionProfile, DatabaseSchema, QueryResult, UpdateCellInput, UpdateCellResult } from "@/lib/types"

export const isNativeApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

function nativeOnlyError(action: string) {
  return new Error(`${action} requires the Tablescape desktop app. The browser preview does not connect to databases or return synthetic data.`)
}

export async function connectDatabase(config: ConnectionInput): Promise<{ connection: ConnectionProfile; schema: DatabaseSchema }> {
  if (!isNativeApp()) throw nativeOnlyError("Connecting to a database")
  return invoke("connect_database", { config })
}

export async function disconnectDatabase(connectionId: string) {
  if (!isNativeApp()) throw nativeOnlyError("Disconnecting a database")
  await invoke("disconnect_database", { connectionId })
}

export async function refreshSchema(connectionId: string): Promise<DatabaseSchema> {
  if (!isNativeApp()) throw nativeOnlyError("Refreshing a schema")
  return invoke("get_schema", { connectionId })
}

export async function runQuery(connectionId: string, sql: string, limit = 500): Promise<QueryResult> {
  if (!isNativeApp()) throw nativeOnlyError("Running queries")
  return invoke("execute_query", { request: { connectionId, sql, limit } })
}

export async function updateCell(input: UpdateCellInput): Promise<UpdateCellResult> {
  if (!isNativeApp()) throw nativeOnlyError("Editing data")
  return invoke("update_cell", { request: input })
}

export async function chooseDatabaseFile(): Promise<string | null> {
  if (!isNativeApp()) return null
  const selected = await open({ multiple: false, directory: false, filters: [{ name: "Databases", extensions: ["db", "sqlite", "sqlite3"] }] })
  return typeof selected === "string" ? selected : null
}

export async function chooseSqlFile(): Promise<string | null> {
  if (!isNativeApp()) return null
  const selected = await open({ multiple: false, directory: false, filters: [{ name: "SQL", extensions: ["sql"] }] })
  return typeof selected === "string" ? selected : null
}

export async function importSqlFile(path: string, name: string): Promise<{ connection: ConnectionProfile; schema: DatabaseSchema }> {
  if (!isNativeApp()) throw nativeOnlyError("Importing SQL files")
  return invoke("import_sql_file", { path, name })
}
