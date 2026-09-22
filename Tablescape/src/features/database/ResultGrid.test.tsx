import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { QueryResult } from "@/lib/types"
import { ResultGrid } from "./ResultGrid"
import type { TableSchema } from "@/lib/types"

const result: QueryResult = {
  columns: ["id", "name", "note"],
  rows: [
    { id: 1, name: "Ada", note: null },
    { id: 2, name: "Grace", note: "compiler" },
  ],
  affectedRows: 0,
  durationMs: 4.2,
  truncated: false,
  message: "2 rows returned",
}

const table: TableSchema = {
  schema: "main",
  name: "people",
  kind: "table",
  rowCount: 2,
  columns: [
    { name: "id", dataType: "INTEGER", nullable: false, primaryKey: true, defaultValue: null },
    { name: "name", dataType: "TEXT", nullable: false, primaryKey: false, defaultValue: null },
    { name: "note", dataType: "TEXT", nullable: true, primaryKey: false, defaultValue: null },
  ],
  foreignKeys: [],
}

describe("ResultGrid", () => {
  it("renders columns, values, nulls, and query metadata", () => {
    render(<TooltipProvider><ResultGrid result={result} /></TooltipProvider>)
    expect(screen.getByText("2 rows returned")).toBeInTheDocument()
    expect(screen.getByText("Ada")).toBeInTheDocument()
    expect(screen.getByText("NULL")).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument()
  })

  it("filters loaded rows without issuing another query", async () => {
    const user = userEvent.setup()
    render(<TooltipProvider><ResultGrid result={result} /></TooltipProvider>)
    await user.type(screen.getByRole("textbox", { name: "Filter results" }), "Grace")
    expect(screen.getByText("Grace")).toBeInTheDocument()
    expect(screen.queryByText("Ada")).not.toBeInTheDocument()
  })

  it("edits a non-key cell and saves the parsed value", async () => {
    const user = userEvent.setup()
    const onUpdateCell = vi.fn().mockResolvedValue(undefined)
    render(<TooltipProvider><ResultGrid result={result} editable table={table} onUpdateCell={onUpdateCell} /></TooltipProvider>)

    await user.click(screen.getByRole("button", { name: "Edit name, row 1" }))
    const input = screen.getByRole("textbox", { name: "New value for name, row 1" })
    await user.clear(input)
    await user.type(input, "Ada Lovelace")
    await user.click(screen.getByRole("button", { name: "Save value" }))

    expect(onUpdateCell).toHaveBeenCalledWith(result.rows[0], "name", "Ada Lovelace")
    expect(screen.queryByRole("button", { name: "Edit id, row 1" })).not.toBeInTheDocument()
  })
})
