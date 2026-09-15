import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { sampleSchema } from "@/lib/sample-data"
import { QueryWorkspace } from "./QueryWorkspace"

const { runQueryMock, toastErrorMock } = vi.hoisted(() => ({ runQueryMock: vi.fn(), toastErrorMock: vi.fn() }))

vi.mock("@/lib/database-api", () => ({ runQuery: runQueryMock }))
vi.mock("sonner", () => ({ toast: { error: toastErrorMock, success: vi.fn() } }))

describe("QueryWorkspace", () => {
  const orders = sampleSchema.tables.find((table) => table.name === "orders")!

  beforeEach(() => {
    runQueryMock.mockReset()
    toastErrorMock.mockReset()
  })

  it("executes the editor SQL and renders returned rows", async () => {
    const user = userEvent.setup()
    runQueryMock.mockResolvedValue({ columns: ["id", "status"], rows: [{ id: 42, status: "fulfilled" }], affectedRows: 0, durationMs: 3, truncated: false, message: "1 row returned" })
    render(<TooltipProvider><QueryWorkspace connectionId="db-1" initialTable={orders} readOnly={false} /></TooltipProvider>)
    await user.click(screen.getByRole("button", { name: /^Run/ }))
    await waitFor(() => expect(runQueryMock).toHaveBeenCalledWith("db-1", expect.stringContaining('FROM "public"."orders"'), 500))
    expect(await screen.findByText("fulfilled")).toBeInTheDocument()
  })

  it("blocks mutations before transport on read-only connections", async () => {
    const user = userEvent.setup()
    render(<TooltipProvider><QueryWorkspace connectionId="db-1" initialTable={orders} readOnly /></TooltipProvider>)
    await user.clear(screen.getByLabelText("SQL query"))
    await user.type(screen.getByLabelText("SQL query"), "DELETE FROM public.orders;")
    await user.click(screen.getByRole("button", { name: /^Run/ }))
    expect(runQueryMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringContaining("read-only"))
  })
})
