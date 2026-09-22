import { describe, expect, it } from "vitest"
import { testSchema } from "@/test/fixtures"
import { safeFileName, schemaToJson, schemaToMermaid } from "./schema-export"

describe("schema export", () => {
  it("serializes the inspected schema without changing it", () => {
    expect(JSON.parse(schemaToJson(testSchema))).toEqual(testSchema)
  })

  it("exports entities, columns, and relationships as Mermaid ERD", () => {
    const mermaid = schemaToMermaid(testSchema)
    expect(mermaid).toContain("erDiagram")
    expect(mermaid).toContain("public_accounts")
    expect(mermaid).toContain("billing_payments")
    expect(mermaid).toContain("payments_account_fkey")
  })

  it("creates safe portable file names", () => {
    expect(safeFileName("  Billing / Production  ")).toBe("billing-production")
  })
})
