import { describe, expect, it } from "vitest";
import { buildFlowElements } from "../src/graph/flow/elements";
import { graph } from "./support/fixtures";

describe("React Flow element construction", () => {
  it("handles an empty graph without elements", () =>
    expect(buildFlowElements({ ...graph, nodes: [] })).toEqual({
      nodes: [],
      edges: [],
    }));
  it("does not mutate backend data and produces stable finite positions", () => {
    const input = structuredClone(graph);
    const before = structuredClone(input);
    const first = buildFlowElements(input);
    const second = buildFlowElements(input);
    expect(input).toEqual(before);
    expect(first).toEqual(second);
    for (const node of first.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });
  it.each([
    [{ name: "Alice", title: "Other" }, "Alice"],
    [{ title: "A title" }, "A title"],
    [{ name: 0 }, "0"],
    [{ username: "user" }, "user"],
    [{}, "User 0"],
    [{ name: "x".repeat(100) }, "x".repeat(27) + "…"],
  ])("chooses a readable caption from %j", (properties, expected) => {
    const { nodes } = buildFlowElements({
      ...graph,
      nodes: [{ ...graph.nodes[0], properties }],
    });
    expect(nodes[0].data.caption).toBe(expected);
    expect(nodes[0].ariaLabel).toContain(expected);
  });
  it("preserves exact IDs, parallel edges, self loops, and valid handles", () => {
    const input = {
      ...graph,
      nodes: [
        ...graph.nodes,
        { id: "18446744073709551615", label: null, properties: {} },
      ],
      edges: [
        { id: "1", label: "Link", source: "0", target: "18446744073709551615" },
        { id: "2", label: "Link", source: "0", target: "18446744073709551615" },
        { id: "3", label: null, source: "0", target: "0" },
        { id: "4", label: null, source: "0", target: "missing" },
      ],
    };
    const { nodes, edges } = buildFlowElements(input);
    expect(nodes.map((node) => node.id)).toEqual(["0", "18446744073709551615"]);
    expect(edges).toHaveLength(3);
    expect(edges[0].data).toMatchObject({
      parallelCount: 2,
      parallelIndex: 0,
      loop: false,
    });
    expect(edges[1].data).toMatchObject({ parallelCount: 2, parallelIndex: 1 });
    expect(edges[2]).toMatchObject({
      sourceHandle: "source-right",
      targetHandle: "target-top",
      data: { loop: true },
    });
    for (const edge of edges) {
      expect(edge.sourceHandle).toMatch(/^source-(top|right|bottom|left)$/);
      expect(edge.targetHandle).toMatch(/^target-(top|right|bottom|left)$/);
    }
  });
  it("keeps dense connected selections finite and gives cards distinct positions", () => {
    const nodes = Array.from({ length: 32 }, (_, index) => ({
      id: String(index),
      label: "User",
      properties: {},
    }));
    const edges = nodes
      .slice(1)
      .map((node) => ({
        id: `edge-${node.id}`,
        label: null,
        source: "0",
        target: node.id,
      }));
    const built = buildFlowElements({ ...graph, nodes, edges });
    expect(built.nodes).toHaveLength(nodes.length);
    expect(built.edges).toHaveLength(edges.length);
    for (const node of built.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
    expect(
      new Set(
        built.nodes.map((node) => `${node.position.x},${node.position.y}`),
      ).size,
    ).toBe(nodes.length);
  });
});
