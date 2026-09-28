// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphWorkspace } from "../src/app/GraphWorkspace";
import type { GraphData } from "../src/results";
import type { ConnectionStatus } from "../src/app/types";
import { graph } from "./support/fixtures";

vi.mock("../src/graph/GraphCanvas", () => ({
  GraphCanvas: ({
    onSelect,
    onExpand,
  }: {
    onSelect: (event: { kind: "node"; id: string }) => void;
    onExpand: (id: string) => void;
  }) => (
    <div>
      <button onClick={() => onSelect({ kind: "node", id: "0" })}>
        Select node
      </button>
      <button onClick={() => onExpand("0")}>Expand node</button>
    </div>
  ),
}));
afterEach(cleanup);
function workspace() {
  return {
    graph: null as GraphData | null,
    status: { kind: "connected", durationMs: 1 } as ConnectionStatus,
    refreshCurrentGraph: vi.fn(),
    graphLoading: false,
    setView: vi.fn(),
    selectedId: null,
    onGraphSelect: vi.fn(),
    expandNode: vi.fn(),
    graphError: null as string | null,
    setConnectionOpenRequest: vi.fn(),
    detail: null,
    detailLoading: false,
    detailError: null,
    inspect: vi.fn(),
  };
}

describe("graph workspace states", () => {
  it("opens connection settings from the disconnected state and navigates to the editor", () => {
    const options = workspace();
    options.status = { kind: "disconnected" };
    render(<GraphWorkspace workspace={options} theme="light" />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Now" }));
    const increment = options.setConnectionOpenRequest.mock.calls[0][0];
    expect(increment(2)).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "Edit graph query" }));
    expect(options.setView).toHaveBeenCalledWith("query");
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });
  it("announces initial loading and prevents another refresh", () => {
    const options = workspace();
    options.graphLoading = true;
    render(<GraphWorkspace workspace={options} theme="dark" />);
    expect(screen.getByRole("status").textContent).toContain(
      "Syncing graph data",
    );
    expect(
      (screen.getByRole("button", { name: "Refreshing…" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("offers retries after failure and distinguishes an empty database", () => {
    const options = workspace();
    options.graphError = "offline";
    const view = render(<GraphWorkspace workspace={options} theme="dark" />);
    expect(screen.getByRole("alert").textContent).toContain("offline");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(options.refreshCurrentGraph).toHaveBeenCalledOnce();
    view.rerender(
      <GraphWorkspace
        workspace={{ ...options, graphError: null }}
        theme="dark"
      />,
    );
    expect(screen.getByText("No graph data found")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Refresh" })[1]);
    expect(options.refreshCurrentGraph).toHaveBeenCalledTimes(2);
  });
  it("passes selection and expansion actions to the lazy canvas and preserves it during refresh", async () => {
    const options = workspace();
    options.graph = graph;
    options.graphLoading = true;
    render(<GraphWorkspace workspace={options} theme="light" />);
    fireEvent.click(await screen.findByRole("button", { name: "Select node" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand node" }));
    expect(options.onGraphSelect).toHaveBeenCalledWith({
      kind: "node",
      id: "0",
    });
    expect(options.expandNode).toHaveBeenCalledWith("0");
    expect(screen.queryByText("Syncing graph data")).toBeNull();
    expect(screen.getByText("1 nodes · 0 edges")).toBeTruthy();
  });
  it.each([1, 2])(
    "explains sample caps and %s dangling edges",
    (danglingEdges) => {
      const options = workspace();
      options.graph = {
        ...graph,
        nodes: [],
        truncatedNodes: true,
        truncatedEdges: true,
        danglingEdges,
      };
      render(<GraphWorkspace workspace={options} theme="light" />);
      expect(
        screen.getByText(/the node limit was reached/).textContent,
      ).toContain("EDGE LIMIT");
      expect(screen.getByText(/left the selection/).textContent).toContain(
        danglingEdges === 1 ? "1 edge left" : "2 edges left",
      );
    },
  );
});
