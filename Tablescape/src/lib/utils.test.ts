import { describe, expect, it } from "vitest"
import { qualifyTable, quoteIdentifier } from "./utils"

describe("SQL identifiers", () => {
  it("uses ANSI quotes for SQLite and PostgreSQL", () => {
    expect(qualifyTable("public", "order items", "postgres")).toBe('"public"."order items"')
    expect(quoteIdentifier('say"hello', "sqlite")).toBe('"say""hello"')
  })

  it("uses backticks for MySQL", () => {
    expect(qualifyTable("shop", "order items", "mysql")).toBe(`\`shop\`.\`order items\``)
    expect(quoteIdentifier("odd`name", "mysql")).toBe(`\`odd\`\`name\``)
  })
})
