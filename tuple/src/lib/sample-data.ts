import type { ConnectionProfile, DatabaseSchema, QueryResult } from "@/lib/types"

export const sampleConnection: ConnectionProfile = {
  id: "sample-commerce",
  name: "Northstar Commerce",
  kind: "sample",
  detail: "Sample PostgreSQL workspace",
  connected: true,
  readOnly: true,
}

export const sampleSchema: DatabaseSchema = {
  name: "northstar",
  dialect: "sample",
  loadedAt: new Date().toISOString(),
  tables: [
    {
      schema: "public", name: "customers", kind: "table", rowCount: 28420,
      columns: [
        { name: "id", dataType: "uuid", nullable: false, primaryKey: true, defaultValue: "gen_random_uuid()" },
        { name: "email", dataType: "varchar(255)", nullable: false, primaryKey: false, defaultValue: null },
        { name: "full_name", dataType: "varchar(160)", nullable: false, primaryKey: false, defaultValue: null },
        { name: "segment", dataType: "customer_segment", nullable: true, primaryKey: false, defaultValue: "'standard'" },
        { name: "created_at", dataType: "timestamptz", nullable: false, primaryKey: false, defaultValue: "now()" },
      ],
      foreignKeys: [],
    },
    {
      schema: "public", name: "orders", kind: "table", rowCount: 184239,
      columns: [
        { name: "id", dataType: "bigint", nullable: false, primaryKey: true, defaultValue: null },
        { name: "customer_id", dataType: "uuid", nullable: false, primaryKey: false, defaultValue: null },
        { name: "status", dataType: "order_status", nullable: false, primaryKey: false, defaultValue: "'pending'" },
        { name: "total_cents", dataType: "integer", nullable: false, primaryKey: false, defaultValue: "0" },
        { name: "placed_at", dataType: "timestamptz", nullable: false, primaryKey: false, defaultValue: "now()" },
      ],
      foreignKeys: [{ name: "orders_customer_id_fkey", fromColumn: "customer_id", toSchema: "public", toTable: "customers", toColumn: "id" }],
    },
    {
      schema: "catalog", name: "products", kind: "table", rowCount: 3842,
      columns: [
        { name: "id", dataType: "uuid", nullable: false, primaryKey: true, defaultValue: "gen_random_uuid()" },
        { name: "sku", dataType: "varchar(48)", nullable: false, primaryKey: false, defaultValue: null },
        { name: "name", dataType: "text", nullable: false, primaryKey: false, defaultValue: null },
        { name: "price_cents", dataType: "integer", nullable: false, primaryKey: false, defaultValue: null },
        { name: "inventory", dataType: "integer", nullable: false, primaryKey: false, defaultValue: "0" },
      ],
      foreignKeys: [],
    },
    {
      schema: "public", name: "order_items", kind: "table", rowCount: 493201,
      columns: [
        { name: "id", dataType: "bigint", nullable: false, primaryKey: true, defaultValue: null },
        { name: "order_id", dataType: "bigint", nullable: false, primaryKey: false, defaultValue: null },
        { name: "product_id", dataType: "uuid", nullable: false, primaryKey: false, defaultValue: null },
        { name: "quantity", dataType: "smallint", nullable: false, primaryKey: false, defaultValue: "1" },
        { name: "unit_price_cents", dataType: "integer", nullable: false, primaryKey: false, defaultValue: null },
      ],
      foreignKeys: [
        { name: "order_items_order_id_fkey", fromColumn: "order_id", toSchema: "public", toTable: "orders", toColumn: "id" },
        { name: "order_items_product_id_fkey", fromColumn: "product_id", toSchema: "catalog", toTable: "products", toColumn: "id" },
      ],
    },
    {
      schema: "billing", name: "payments", kind: "table", rowCount: 179882,
      columns: [
        { name: "id", dataType: "uuid", nullable: false, primaryKey: true, defaultValue: "gen_random_uuid()" },
        { name: "order_id", dataType: "bigint", nullable: false, primaryKey: false, defaultValue: null },
        { name: "provider", dataType: "varchar(32)", nullable: false, primaryKey: false, defaultValue: null },
        { name: "amount_cents", dataType: "integer", nullable: false, primaryKey: false, defaultValue: null },
        { name: "captured_at", dataType: "timestamptz", nullable: true, primaryKey: false, defaultValue: null },
      ],
      foreignKeys: [{ name: "payments_order_id_fkey", fromColumn: "order_id", toSchema: "public", toTable: "orders", toColumn: "id" }],
    },
    {
      schema: "analytics", name: "daily_revenue", kind: "view", rowCount: null,
      columns: [
        { name: "day", dataType: "date", nullable: true, primaryKey: false, defaultValue: null },
        { name: "order_count", dataType: "bigint", nullable: true, primaryKey: false, defaultValue: null },
        { name: "gross_revenue", dataType: "numeric", nullable: true, primaryKey: false, defaultValue: null },
      ],
      foreignKeys: [],
    },
  ],
}

const sampleRows = [
  { id: 10842, customer: "Avery Chen", email: "avery@example.com", status: "fulfilled", total: "$248.00", placed_at: "2026-09-14 14:32:08" },
  { id: 10841, customer: "Noor Williams", email: "noor@example.com", status: "processing", total: "$86.50", placed_at: "2026-09-14 14:19:44" },
  { id: 10840, customer: "Mateo Silva", email: "mateo@example.com", status: "fulfilled", total: "$412.20", placed_at: "2026-09-14 13:58:17" },
  { id: 10839, customer: "Iris Park", email: "iris@example.com", status: "pending", total: "$52.00", placed_at: "2026-09-14 13:41:02" },
  { id: 10838, customer: "Theo Martin", email: "theo@example.com", status: "refunded", total: "$129.99", placed_at: "2026-09-14 12:55:36" },
  { id: 10837, customer: "Zara Khan", email: "zara@example.com", status: "fulfilled", total: "$319.80", placed_at: "2026-09-14 12:38:11" },
  { id: 10836, customer: "Leo Brooks", email: "leo@example.com", status: "processing", total: "$74.25", placed_at: "2026-09-14 11:49:53" },
]

export function sampleQueryResult(sql: string): QueryResult {
  const isCount = /count\s*\(/i.test(sql)
  if (isCount) return { columns: ["count"], rows: [{ count: 184239 }], affectedRows: 0, durationMs: 18.4, truncated: false, message: "1 row returned" }
  return { columns: Object.keys(sampleRows[0]), rows: sampleRows, affectedRows: 0, durationMs: 34.7, truncated: false, message: `${sampleRows.length} rows returned` }
}
