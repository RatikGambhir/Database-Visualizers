import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { sampleQueryResult, sampleSchema } from "@/lib/sample-data"
import type { ConnectionInput, ConnectionProfile, DatabaseSchema, QueryResult, UpdateCellInput, UpdateCellResult } from "@/lib/types"

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
const pause = (ms = 280) => new Promise((resolve) => window.setTimeout(resolve, ms))

export async function connectDatabase(config: ConnectionInput): Promise<{ connection: ConnectionProfile; schema: DatabaseSchema }> {
  if (!inTauri()) {
    await pause()
    return {
      connection: { id: crypto.randomUUID(), name: config.name, kind: config.kind, detail: config.path ?? redactConnectionUrl(config.url) ?? "Local database", connected: true, readOnly: config.readOnly },
      schema: { ...sampleSchema, name: config.name, dialect: config.kind },
    }
  }
  return invoke("connect_database", { config })
}

export async function disconnectDatabase(connectionId: string) {
  if (!inTauri()) return
  await invoke("disconnect_database", { connectionId })
}

export async function refreshSchema(connectionId: string): Promise<DatabaseSchema> {
  if (!inTauri() || connectionId === "sample-commerce") {
    await pause(180)
    return { ...sampleSchema, loadedAt: new Date().toISOString() }
  }
  return invoke("get_schema", { connectionId })
}

export async function runQuery(connectionId: string, sql: string, limit = 500): Promise<QueryResult> {
  if (!inTauri() || connectionId === "sample-commerce") {
    await pause(380)
    if (/\b(drop|truncate)\b/i.test(sql)) throw new Error("The sample workspace is read-only.")
    return sampleQueryResult(sql)
  }
  return invoke("execute_query", { request: { connectionId, sql, limit } })
}

export async function updateCell(input: UpdateCellInput): Promise<UpdateCellResult> {
  if (!inTauri() || input.connectionId === "sample-commerce") {
    throw new Error("Data changes are available in the native app with an editable connection.")
  }
  return invoke("update_cell", { request: input })
}

export async function chooseDatabaseFile(): Promise<string | null> {
  if (!inTauri()) return null
  const selected = await open({ multiple: false, directory: false, filters: [{ name: "Databases", extensions: ["db", "sqlite", "sqlite3"] }] })
  return typeof selected === "string" ? selected : null
}

export async function chooseSqlFile(): Promise<string | null> {
  if (!inTauri()) return null
  const selected = await open({ multiple: false, directory: false, filters: [{ name: "SQL", extensions: ["sql"] }] })
  return typeof selected === "string" ? selected : null
}

export async function importSqlFile(path: string, name: string): Promise<{ connection: ConnectionProfile; schema: DatabaseSchema }> {
  if (!inTauri()) {
    await pause()
    return { connection: { id: crypto.randomUUID(), name, kind: "sql-file", detail: path, connected: false, readOnly: true }, schema: { ...sampleSchema, name, dialect: "sql-file" } }
  }
  return invoke("import_sql_file", { path, name })
}

function redactConnectionUrl(url?: string) {
  return url?.replace(/(^[a-z][a-z0-9+.-]*:\/\/[^:/@]+)(?::[^@]*)?@/i, "$1:••••@")
}
