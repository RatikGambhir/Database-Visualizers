// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/ui/Inspector";
import { detail } from "./support/fixtures";

afterEach(cleanup);
const props = () => ({
  detail: null as typeof detail | null,
  loading: false,
  error: null as string | null,
  onInspect: vi.fn(),
  onFocusInGraph: vi.fn(),
});

describe("entity inspector", () => {
  it("prioritizes loading, then errors, then the selection hint", () => {
    const options = props();
    const view = render(<Inspector {...options} loading error="failed" />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    view.rerender(<Inspector {...options} error="failed" />);
    expect(screen.getByText("failed")).toBeTruthy();
    view.rerender(<Inspector {...options} />);
    expect(screen.getByText(/Select a node or edge/)).toBeTruthy();
  });
  it("shows properties and focuses the zero-ID node's neighborhood", () => {
    const options = props();
    render(
      <Inspector
        {...options}
        detail={{
          ...detail,
          properties: {
            externalId: "18446744073709551615",
            active: true,
            tags: ["a", "b"],
          },
        }}
      />,
    );
    expect(screen.getByText("18446744073709551615")).toBeTruthy();
    expect(screen.getByText('["a","b"]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show neighbourhood" }));
    expect(options.onFocusInGraph).toHaveBeenCalledWith("0");
  });
  it("handles absent metadata, properties and relationships", () => {
    render(
      <Inspector
        {...props()}
        detail={{
          ...detail,
          id: null,
          label: null,
          properties: {},
          degree: null,
        }}
      />,
    );
    expect(screen.getByText("(no label)")).toBeTruthy();
    expect(screen.getByText("No stored properties.")).toBeTruthy();
    expect(screen.getByText("Nothing connected.")).toBeTruthy();
    expect(screen.getByText("No neighbours.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Show neighbourhood" }),
    ).toBeNull();
  });
  it("links incoming and outgoing relationships and announces capped results", () => {
    const options = props();
    render(
      <Inspector
        {...options}
        detail={{
          ...detail,
          degree: 4,
          edges: [
            { id: "e1", label: "Out", source: "0", target: "2" },
            { id: "e2", label: null, source: "3", target: "0" },
          ],
          neighbours: [{ id: "2", label: "User", properties: {} }],
        }}
      />,
    );
    expect(screen.getByLabelText("outgoing")).toBeTruthy();
    expect(screen.getByLabelText("incoming")).toBeTruthy();
    expect(screen.getByText("DESCRIBE NODE 0 LIMIT 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Out" }));
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "User · 2" }));
    expect(options.onInspect.mock.calls).toEqual([
      ["edge", "e1"],
      ["node", "3"],
      ["node", "2"],
    ]);
  });
  it("shows available edge endpoints while handling an unavailable target", () => {
    const options = props();
    render(
      <Inspector
        {...options}
        detail={{
          ...detail,
          entity: "edges",
          endpoints: {
            source: { id: "0", label: null, properties: {} },
            target: null,
          },
        }}
      />,
    );
    expect(screen.getByText("unavailable")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "(no label) · 0" }));
    expect(options.onInspect).toHaveBeenCalledWith("node", "0");
    expect(screen.queryByText("Neighbours")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Show neighbourhood" }),
    ).toBeNull();
  });
});
