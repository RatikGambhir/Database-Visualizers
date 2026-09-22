import type { ConnectionProfile, DatabaseSchema } from "@/lib/types"

export const testConnection: ConnectionProfile = {
  id: "test-db",
  name: "Test database",
  kind: "postgres",
  detail: "postgresql://tester:••••@localhost/test",
  connected: true,
  readOnly: true,
}

export const testSchema: DatabaseSchema = {
  name: "test",
  dialect: "postgres",
  loadedAt: "2026-01-01T00:00:00.000Z",
  tables: [
    {
      schema: "public",
      name: "accounts",
      kind: "table",
      rowCount: 2,
      columns: [
        { name: "id", dataType: "uuid", nullable: false, primaryKey: true, defaultValue: null },
        { name: "email", dataType: "text", nullable: false, primaryKey: false, defaultValue: null },
      ],
      foreignKeys: [],
    },
    {
      schema: "billing",
      name: "payments",
      kind: "table",
      rowCount: 1,
      columns: [
        { name: "id", dataType: "bigint", nullable: false, primaryKey: true, defaultValue: null },
        { name: "account_id", dataType: "uuid", nullable: false, primaryKey: false, defaultValue: null },
        { name: "amount", dataType: "numeric", nullable: false, primaryKey: false, defaultValue: "0" },
      ],
      foreignKeys: [{ name: "payments_account_fkey", fromColumn: "account_id", toSchema: "public", toTable: "accounts", toColumn: "id" }],
    },
  ],
}
