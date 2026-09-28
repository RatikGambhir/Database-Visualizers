// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Schema } from "../src/schema";
import { SchemaView } from "../src/ui/SchemaView";
import { populatedSchema } from "./support/schema";

afterEach(cleanup);
const props = () => ({
  schema: null as Schema | null,
  error: null as string | null,
  loading: false,
  connected: true,
  onRefresh: vi.fn(),
  onConnect: vi.fn(),
  onUseQuery: vi.fn(),
});

describe("schema browsing", () => {
  it("offers a connection action and disables refresh when disconnected", () => {
    const options = props();
    render(<SchemaView {...options} connected={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Now" }));
    expect(options.onConnect).toHaveBeenCalledOnce();
    expect(
      (screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("shows initial loading and retries schema errors", () => {
    const options = props();
    const view = render(<SchemaView {...options} loading />);
    expect(screen.getByRole("status").textContent).toContain("Reading schema");
    view.rerender(<SchemaView {...options} error="offline" />);
    expect(screen.getByRole("alert").textContent).toContain("offline");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(options.onRefresh).toHaveBeenCalledOnce();
  });
  it("keeps existing cards visible while refreshing", () => {
    render(<SchemaView {...props()} schema={populatedSchema} loading />);
    expect(screen.getByRole("button", { name: /User/ })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "Refreshing schema",
    );
    expect(
      (screen.getByRole("button", { name: "Refreshing…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("filters labels, clears search, and resets search when changing category", () => {
    render(<SchemaView {...props()} schema={populatedSchema} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: " uSeR " },
    });
    expect(screen.getByRole("button", { name: /User/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Post/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("button", { name: /Post/ })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No matching labels")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Edges/ }));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button", { name: /Follows/ })).toBeTruthy();
  });
  it("expands properties and sends the exact starter query", () => {
    const options = props();
    render(<SchemaView {...options} schema={populatedSchema} />);
    const user = screen.getByRole("button", { name: /User/ });
    expect(user.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(user);
    expect(user.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("2/2 sampled")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open in Query" }));
    expect(options.onUseQuery).toHaveBeenCalledWith(
      populatedSchema.nodeLabels[0].browseQuery,
    );
  });
  it("expands only visible cards and retains hidden cards' state", () => {
    render(<SchemaView {...props()} schema={populatedSchema} />);
    fireEvent.click(screen.getByRole("button", { name: /User/ }));
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Post" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText(/sample timed out/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(
      screen
        .getByRole("button", { name: /User/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /Post/ })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });
  it("distinguishes empty labels and unsupported vector metadata", () => {
    const view = render(
      <SchemaView
        {...props()}
        schema={{ sample: 5, nodeLabels: [], edgeLabels: [] }}
      />,
    );
    expect(screen.getByText("No nodes discovered")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Expand" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    view.rerender(<SchemaView {...props()} schema={populatedSchema} />);
    fireEvent.click(screen.getByRole("button", { name: /Edges/ }));
    fireEvent.click(screen.getByRole("button", { name: /Follows/ }));
    expect(screen.getByText(/No stored properties/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Vectors/ }));
    expect(screen.getByText("No vector indexes discovered")).toBeTruthy();
  });
});
