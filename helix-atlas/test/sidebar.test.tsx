// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "../src/ui/Sidebar";
import type { Schema } from "../src/schema";
import { populatedSchema } from "./support/schema";

afterEach(cleanup);
const props = () => ({
  schema: null as Schema | null,
  schemaError: null as string | null,
  refreshing: false,
  history: [] as string[],
  onRefreshSchema: vi.fn(),
  onUseQuery: vi.fn(),
});

describe("query reference sidebar", () => {
  it("shows initial and failed schema states and prevents concurrent refresh", () => {
    const options = props();
    const view = render(<Sidebar {...options} />);
    expect(screen.getByText("Not loaded yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(options.onRefreshSchema).toHaveBeenCalledOnce();
    view.rerender(<Sidebar {...options} refreshing schemaError="offline" />);
    expect(screen.getByText("offline")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it("collapses mobile reference after selecting an example", () => {
    const options = props();
    render(<Sidebar {...options} />);
    const toggle = screen.getByRole("button", { name: /Reference & examples/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Whole graph" }));
    expect(options.onUseQuery).toHaveBeenCalledWith("QUERY LIMIT 300");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
  it("uses node graph and edge browse queries with alternate actions", () => {
    const options = props();
    render(<Sidebar {...options} schema={populatedSchema} />);
    fireEvent.click(screen.getByRole("button", { name: "User" }));
    fireEvent.click(
      screen.getByTitle(populatedSchema.nodeLabels[0].browseQuery),
    );
    fireEvent.click(screen.getByRole("button", { name: "Follows" }));
    fireEvent.click(
      screen.getByTitle(populatedSchema.edgeLabels[0].graphQuery),
    );
    expect(options.onUseQuery.mock.calls).toEqual([
      [populatedSchema.nodeLabels[0].graphQuery],
      [populatedSchema.nodeLabels[0].browseQuery],
      [populatedSchema.edgeLabels[0].browseQuery],
      [populatedSchema.edgeLabels[0].graphQuery],
    ]);
  });
  it("renders empty label lists and sends history without truncating its source", () => {
    const options = props();
    const source =
      "SELECT id, name\nFROM NODES:User WHERE name = 'Alice' LIMIT 100";
    render(
      <Sidebar
        {...options}
        schema={{ sample: 5000, nodeLabels: [], edgeLabels: [] }}
        history={[source]}
      />,
    );
    expect(screen.getAllByText("None found.")).toHaveLength(2);
    const entry = screen.getByRole("button", {
      name: source.replace(/\s+/g, " ").slice(0, 48),
    });
    expect(entry.getAttribute("title")).toBe(source);
    expect(entry.textContent?.length).toBe(48);
    fireEvent.click(entry);
    expect(options.onUseQuery).toHaveBeenCalledWith(source);
  });
});
