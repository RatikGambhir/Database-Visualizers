// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueryResult } from "../src/results";
import { ResultsPanel } from "../src/ui/ResultsPanel";
import { detail, graph } from "./support/fixtures";

afterEach(cleanup);
function show(result: QueryResult) {
  const onInspect = vi.fn();
  return {
    ...render(
      <ResultsPanel result={result} theme="light" onInspect={onInspect} />,
    ),
    onInspect,
  };
}
function firstColumn() {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

describe("result presentation", () => {
  it("shows empty pages without a table", () => {
    show({ kind: "rows", columns: ["id"], rows: [] });
    expect(screen.getByText("No rows matched.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("sorts exact large integers and fractional numbers in both directions without mutating results", () => {
    const rows = [
      { value: 18446744073709551615n },
      { value: 1.5 },
      { value: 1n },
      { value: 9007199254740993n },
      { value: 9007199254740992n },
    ];
    const before = [...rows];
    show({ kind: "rows", columns: ["value"], rows });
    fireEvent.click(screen.getByRole("button", { name: "value" }));
    expect(firstColumn()).toEqual([
      "1",
      "1.5",
      "9007199254740992",
      "9007199254740993",
      "18446744073709551615",
    ]);
    fireEvent.click(screen.getByRole("button", { name: /value/ }));
    expect(firstColumn()).toEqual([
      "18446744073709551615",
      "9007199254740993",
      "9007199254740992",
      "1.5",
      "1",
    ]);
    expect(rows).toEqual(before);
  });
  it("sorts mixed values, missing cells and numeric strings without coercion errors", () => {
    show({
      kind: "rows",
      columns: ["value"],
      rows: [
        { value: "item10" },
        { value: null },
        { value: "item2" },
        { value: 2n },
        { value: "Infinity" },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "value" }));
    expect(firstColumn()).toEqual(["", "2", "Infinity", "item2", "item10"]);
  });
  it("resets direction when changing sort columns", () => {
    show({
      kind: "rows",
      columns: ["name", "age"],
      rows: [
        { name: "Zoe", age: 2 },
        { name: "Ada", age: 3 },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "age" }));
    fireEvent.click(screen.getByRole("button", { name: /age/ }));
    fireEvent.click(screen.getByRole("button", { name: "name" }));
    expect(firstColumn()).toEqual(["Ada", "Zoe"]);
  });
  it("inspects edge IDs and node endpoints with their exact identities, including zero", () => {
    const { onInspect } = show({
      kind: "rows",
      columns: ["id", "source", "target"],
      rows: [{ id: "18446744073709551615", source: 0, target: "2" }],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "18446744073709551615" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "0" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(onInspect.mock.calls).toEqual([
      ["edge", "18446744073709551615"],
      ["node", "0"],
      ["node", "2"],
    ]);
  });
  it("treats a node row ID as a node and leaves empty IDs unlinked", () => {
    const { onInspect } = show({
      kind: "rows",
      columns: ["id", "name"],
      rows: [
        { id: "0", name: "Alice" },
        { id: null, name: "Unknown" },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "0" }));
    expect(onInspect).toHaveBeenCalledWith("node", "0");
    expect(
      within(screen.getAllByRole("row")[2]).queryByRole("button"),
    ).toBeNull();
  });
  it("renders empty groups and optional label categories", () => {
    show({ kind: "labels", nodes: [], edges: null });
    expect(screen.getByText("Node labels")).toBeTruthy();
    expect(screen.getByText("Nothing to show.")).toBeTruthy();
    expect(screen.queryByText("Edge labels")).toBeNull();
  });
  it("keeps zero-count bars finite", () => {
    const { container } = show({
      kind: "groupCount",
      by: "label",
      groups: [
        { label: "User", count: 0 },
        { label: "Post", count: 0 },
      ],
    });
    const bars = Array.from(
      container.querySelectorAll<HTMLElement>(".bar-fill"),
    );
    expect(bars.map((bar) => bar.style.width)).toEqual(["1.5%", "1.5%"]);
  });
  it("scales grouped counts and formats count tiles", () => {
    const view = show({
      kind: "groupCount",
      by: "label",
      groups: [
        { label: "User", count: 4 },
        { label: "Post", count: 2 },
      ],
    });
    expect(
      Array.from(view.container.querySelectorAll<HTMLElement>(".bar-fill")).map(
        (bar) => bar.style.width,
      ),
    ).toEqual(["100%", "50%"]);
    view.rerender(
      <ResultsPanel
        result={{ kind: "count", value: 12345 }}
        theme="dark"
        onInspect={view.onInspect}
      />,
    );
    expect(screen.getByText((12345).toLocaleString())).toBeTruthy();
  });
  it("renders stats, graph and describe result guidance", () => {
    const view = show({
      kind: "stats",
      nodeCount: 100,
      edgeCount: 20,
      nodeLabels: [{ label: "User", count: 100 }],
      edgeLabels: [{ label: "Follows", count: 20 }],
    });
    expect(screen.getByText("Node labels")).toBeTruthy();
    expect(screen.getByText("Edge labels")).toBeTruthy();
    view.rerender(
      <ResultsPanel
        result={{ kind: "graph", graph }}
        theme="dark"
        onInspect={view.onInspect}
      />,
    );
    expect(screen.getByText(/1 nodes and 0 edges/)).toBeTruthy();
    view.rerender(
      <ResultsPanel result={detail} theme="dark" onInspect={view.onInspect} />,
    );
    expect(screen.getByText(/inspector on the right/)).toBeTruthy();
  });
});
