import type {
  CompiledQuery,
  ConnectionView,
  ConnectionUpdate,
  QueryExecution,
} from "../../src/client";
import type { GraphData, QueryResult } from "../../src/results";
import type { Schema } from "../../src/schema";

export const initialSource = "QUERY LIMIT 300";
export const update: ConnectionUpdate = {
  url: "http://localhost:6969",
  protocol: "v2",
  deployment: "local",
  timeoutMs: 30000,
  writerOnly: false,
};
export const connection: ConnectionView = {
  ...update,
  revision: 1,
  endpoint: "http://localhost:6969/v2/query",
  databaseId: null,
  hasApiKey: false,
};
export const schema: Schema = { nodeLabels: [], edgeLabels: [], sample: 5000 };
export const graph: GraphData = {
  nodes: [{ id: "0", label: "User", properties: { name: "Alice" } }],
  edges: [],
  danglingEdges: 0,
  truncatedNodes: false,
  truncatedEdges: false,
};
export const detail: Extract<QueryResult, { kind: "describe" }> = {
  kind: "describe",
  entity: "nodes",
  id: "0",
  label: "User",
  properties: { name: "Alice" },
  edges: [],
  neighbours: [],
  degree: 0,
  endpoints: null,
};

export function compiled(source = initialSource, revision = 2): CompiledQuery {
  return {
    protocol: "v2",
    executionKind: "read",
    endpointPath: "/v2/query",
    endpoint: connection.endpoint,
    connectionRevision: revision,
    transportJson: JSON.stringify({ source }),
    summary: source,
  };
}

export function execution(
  result: QueryResult = { kind: "count", value: 3 },
  source = initialSource,
  revision = 2,
): QueryExecution {
  return { result, compiled: compiled(source, revision), durationMs: 5 };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
