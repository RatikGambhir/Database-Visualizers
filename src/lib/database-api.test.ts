import { describe, expect, it } from "vitest"
import { runQuery } from "./database-api"

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
})
