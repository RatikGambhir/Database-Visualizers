import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { sampleConnection, sampleSchema } from "@/lib/sample-data"
import { ExplorerSidebar } from "./ExplorerSidebar"

describe("ExplorerSidebar", () => {
  it("filters objects and opens the selected table", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<TooltipProvider><ExplorerSidebar connection={sampleConnection} schema={sampleSchema} selectedTable={null} onSelectTable={onSelect} onAddConnection={vi.fn()} /></TooltipProvider>)
    await user.type(screen.getByPlaceholderText("Filter tables…"), "payments")
    expect(screen.getByRole("button", { name: /payments/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /customers/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /payments/i }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: "payments", schema: "billing" }))
  })
})
