import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMockServer, dispatchRead, parseJsonBig, stringifyBig, type MockGraph } from "../tools/mock-helix-server.mjs";

const canonical = parseJsonBig(readFileSync(new URL("../contracts/helixdb-v2/conformance.json", import.meta.url), "utf8"));
const compiled = parseJsonBig(readFileSync(new URL("../contracts/helixdb-v2/helixsql-conformance.json", import.meta.url), "utf8"));

// Replay the sanitized isolated-server seed without enabling mock mutations.
function seededGraph(): MockGraph {
  const graph: MockGraph = { nodes: new Map(), edges: new Map() };
  for (const entry of canonical.fixtures[0].request.query.write.entries) {
    const root = entry.query.root;
    const creation = root.add_n ?? root.add_e;
    const props = Object.fromEntries(creation.properties.map(([name, input]: [string, { value: Record<string, unknown> }]) => [name, (input.value as unknown) === "null" ? null : Object.values(input.value)[0]]));
    if (root.add_n) {
      const id = BigInt(graph.nodes.size);
      graph.nodes.set(id, { id, label: creation.label, properties: props });
    } else {
      const id = BigInt(graph.edges.size);
      graph.edges.set(id, { id, label: creation.label, properties: props, from: 0n, to: entry.query.name === "ac" ? 2n : entry.query.name === "aa" ? 0n : 1n });
    }
  }
  return graph;
}

const legacy = { request_type: "read", query: { queries: [{ Query: { name: "count", steps: [{ N: "All" }, "Count"], condition: null } }], returns: ["count"] } };
const v2 = { request_type: "read", query: { read: { entries: [{ query: { name: "count", root: { count: { input: { nodes: { reference: "all" } } } } } }], returns: ["count"] } } };

describe("protocol and endpoint must agree", () => {
  const { graph } = createMockServer();
  it("accepts each matching read adapter", () => {
    expect(dispatchRead("/v1/query", legacy, graph)).toEqual(dispatchRead("/v2/query", v2, graph));
  });
  it.each([["/v1/query", v2], ["/v2/query", legacy], ["/v2/query", { ...v2, request_type: "write" }], ["/v2/query", { ...v2, query: { ...v2.query, write: {} } }], ["/v2/query", { request_type: "read", query: { read: {} } }]])("rejects malformed or cross-version bodies at %s", (path, request) => {
    expect(() => dispatchRead(path, request, graph)).toThrow();
  });
  it("rejects missing returns, writes, and unsupported operations", () => {
    for (const root of [{ add_n: { label: "User" } }, { unknown: {} }]) {
      expect(() => dispatchRead("/v2/query", { request_type: "read", query: { read: { entries: [{ query: { name: "rows", root } }], returns: ["rows"] } } }, graph)).toThrow();
    }
    expect(() => dispatchRead("/v2/query", { ...v2, query: { read: { ...v2.query.read, returns: ["absent"] } } }, graph)).toThrow();
  });
  it("preserves legacy duplicate traversal rows", () => {
    const request = { request_type: "read", query: { queries: [{ Query: { name: "rows", steps: [{ N: { Ids: [0] } }, { Out: "FOLLOWS" }, { ValueMap: [] }], condition: null } }], returns: ["rows"] } };
    const response = dispatchRead("/v1/query", request, seededGraph()) as { rows: Array<{ $id: bigint }> };
    expect(response.rows.map((row) => row.$id)).toEqual([1n, 1n, 2n, 0n]);
  });
});

it.each(compiled.captures as Array<{ source: string; request: unknown; response: unknown }>)("mock matches real pinned compiler response: $source", (capture) => {
  expect(parseJsonBig(stringifyBig(dispatchRead("/v2/query", capture.request, seededGraph())))).toEqual(capture.response);
});

it("keeps unsigned IDs and signed properties exact without modifying numeric-looking strings", () => {
  const raw = '{"id":18446744073709551615,"property":-9223372036854775808,"text":"[1, 9223372036854775808]","sentinel":"@@bigint:123@@"}';
  const parsed = parseJsonBig(raw);
  expect(parsed.id).toBe(18446744073709551615n);
  expect(parsed.property).toBe(-9223372036854775808n);
  expect(parsed.text).toBe("[1, 9223372036854775808]");
  expect(parsed.sentinel).toBe("@@bigint:123@@");
  expect(parseJsonBig(stringifyBig(parsed))).toEqual(parsed);
});
