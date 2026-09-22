import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { testSchema } from "@/test/fixtures"
import { WorkspaceSearchDialog } from "./WorkspaceSearchDialog"

describe("WorkspaceSearchDialog", () => {
  it("finds a table by column name and selects it", async () => {
    const user = userEvent.setup()
    const onSelectTable = vi.fn()
    render(<WorkspaceSearchDialog open onOpenChange={vi.fn()} schema={testSchema} onSelectTable={onSelectTable}/>)
    await user.type(screen.getByRole("textbox", { name: /Search tables/ }), "amount")
    expect(screen.getByRole("button", { name: /payments/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /accounts/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /payments/ }))
    expect(onSelectTable).toHaveBeenCalledWith(expect.objectContaining({ name: "payments" }))
  })
})
