import type { DatabaseSchema, TableSchema } from "@/lib/types"

export function schemaToJson(schema: DatabaseSchema) {
  return JSON.stringify(schema, null, 2)
}

export function schemaToMermaid(schema: DatabaseSchema) {
  const entityIds = new Map(schema.tables.map((table) => [tableKey(table), mermaidId(table)]))
  const entities = schema.tables.map((table) => {
    const columns = table.columns.map((column) => {
      const markers = [column.primaryKey ? "PK" : "", table.foreignKeys.some((key) => key.fromColumn === column.name) ? "FK" : ""].filter(Boolean).join(",")
      const comment = column.nullable ? ' "nullable"' : ""
      return `    ${mermaidType(column.dataType)} ${mermaidToken(column.name)}${markers ? ` ${markers}` : ""}${comment}`
    })
    return `  ${entityIds.get(tableKey(table))} {\n${columns.join("\n")}\n  }`
  })
  const relationships = schema.tables.flatMap((table) => table.foreignKeys.flatMap((foreignKey) => {
    const parentKey = `${foreignKey.toSchema ?? table.schema}.${foreignKey.toTable}`
    const parent = entityIds.get(parentKey)
    const child = entityIds.get(tableKey(table))
    if (!parent || !child) return []
    const label = foreignKey.name.replaceAll('"', "'")
    return [`  ${parent} ||--o{ ${child} : "${label}"`]
  }))
  return ["erDiagram", ...entities, ...relationships].join("\n") + "\n"
}

export function downloadText(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export function safeFileName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return normalized || "schema"
}

function tableKey(table: TableSchema) {
  return `${table.schema}.${table.name}`
}

function mermaidId(table: TableSchema) {
  return mermaidToken(`${table.schema}_${table.name}`)
}

function mermaidToken(value: string) {
  const token = value.replace(/[^a-zA-Z0-9_]/g, "_")
  return /^\d/.test(token) ? `_${token}` : token || "unnamed"
}

function mermaidType(value: string) {
  return mermaidToken(value.replace(/\s+/g, "_"))
}
