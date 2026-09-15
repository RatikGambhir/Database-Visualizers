import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { QueryResult } from "@/lib/types"
import { ResultGrid } from "./ResultGrid"

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
    await user.type(screen.getByPlaceholderText("Filter results"), "Grace")
    expect(screen.getByText("Grace")).toBeInTheDocument()
    expect(screen.queryByText("Ada")).not.toBeInTheDocument()
  })
})
