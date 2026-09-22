import { describe, expect, it } from "vitest"
import { connectDatabase, importSqlFile, runQuery } from "./database-api"

describe("browser preview database API", () => {
  it("does not fabricate a successful connection", async () => {
    await expect(connectDatabase({ name: "Remote", kind: "mysql", url: "mysql://localhost/store", readOnly: true })).rejects.toThrow("requires the Tablescape desktop app")
  })

  it("does not fabricate query results", async () => {
    await expect(runQuery("missing", "SELECT 1", 500)).rejects.toThrow("does not connect to databases or return synthetic data")
  })

  it("does not fabricate imported schemas", async () => {
    await expect(importSqlFile("/tmp/schema.sql", "Schema")).rejects.toThrow("requires the Tablescape desktop app")
  })
})
