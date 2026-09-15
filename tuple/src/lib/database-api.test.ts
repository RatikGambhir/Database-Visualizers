import { describe, expect, it } from "vitest"
import { connectDatabase, runQuery } from "./database-api"

describe("browser preview database API", () => {
  it("returns bounded sample rows for the sample connection", async () => {
    const result = await runQuery("sample-commerce", "SELECT * FROM public.orders", 500)
    expect(result.columns).toContain("customer")
    expect(result.rows.length).toBeGreaterThan(1)
    expect(result.truncated).toBe(false)
  })

  it("rejects destructive statements in the preview workspace", async () => {
    await expect(runQuery("sample-commerce", "DROP TABLE orders", 500)).rejects.toThrow("read-only")
  })

  it("redacts passwords in preview connection details", async () => {
    const result = await connectDatabase({ name: "Remote", kind: "mysql", url: "mysql://alice:secret@example.com/store", readOnly: true })
    expect(result.connection.detail).toBe("mysql://alice:••••@example.com/store")
    expect(result.connection.detail).not.toContain("secret")
  })
})
