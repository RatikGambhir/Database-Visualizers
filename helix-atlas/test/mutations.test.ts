import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dispatchRead, parseJsonBig, runWriteBatch, stringifyBig, type MockGraph } from "../tools/mock-helix-server.mjs";
import { parameterValues } from "../src/app/parameters";

const corpus = parseJsonBig(readFileSync(new URL("../contracts/helixdb-v2/mutation-extension-conformance.json", import.meta.url), "utf8"));

describe("captured real mutation contract", () => {
  it("replays successful writes, ordered lookup assertions and rollback with staged state", () => {
    const graph: MockGraph = { nodes: new Map(), edges: new Map() };
    for (const fixture of corpus.fixtures) {
      const before = [graph.nodes.size, graph.edges.size];
      const run = () => fixture.request.request_type === "write" ? runWriteBatch(fixture.request, graph) : dispatchRead("/v2/query", fixture.request, graph);
      if (fixture.status === 200) {
        expect(parseJsonBig(stringifyBig(run())), fixture.name).toEqual(fixture.response);
      } else {
        expect(run, fixture.name).toThrow("requires exactly one node");
        expect([graph.nodes.size, graph.edges.size]).toEqual(before);
      }
    }
  });
  it("keeps integer and node-ID parameter input as decimal strings", () => {
    expect(parameterValues([
      { id: 0, name: "from_id", type: "nodeId", value: "18446744073709551615" },
      { id: 1, name: "value", type: "integer", value: "-9223372036854775808" },
    ])).toEqual({ from_id: { type: "nodeId", value: "18446744073709551615" }, value: { type: "integer", value: "-9223372036854775808" } });
  });
  it("rejects duplicate parameter names and nonfinite floats", () => {
    expect(() => parameterValues([{id:0,name:"x",type:"float",value:"Infinity"}])).toThrow();
    expect(() => parameterValues([{id:0,name:"x",type:"string",value:"a"},{id:1,name:"x",type:"string",value:"b"}])).toThrow("Duplicate");
  });
});
