#!/usr/bin/env node
/**
 * A stand-in HelixDB instance for development and tests.
 *
 * It accepts the flat `POST /v1/query` traversal format used by the app (and
 * supports the pinned operation-tree `/v2/query` format) over a small
 * in-memory sample graph. It implements the subset of steps this app emits, so
 * the visualizer can be exercised without installing HelixDB; it is NOT a
 * HelixDB implementation and makes no claim to match its semantics beyond the
 * steps listed in `applyStep`.
 *
 *   node tools/mock-helix-server.mjs [--port 6969] [--seed 42]
 *
 * Anything the app sends that is not implemented comes back as HTTP 400 with a
 * message naming the step, which is exactly the feedback needed while working
 * on the compiler.
 */
import { createServer } from "node:http";

import { buildGraph } from "./mock/graph.mjs";
import { parseJsonBig, stringifyBig } from "./mock/json.mjs";
import { UnsupportedStep } from "./mock/shared.mjs";
import { runFlatBatch } from "./mock/legacy.mjs";
import { runBatch } from "./mock/v2.mjs";

export { parseJsonBig, stringifyBig } from "./mock/json.mjs";

function parseArgs(argv) {
  const args = { port: 6969, seed: 42 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port") args.port = Number(argv[++i]);
    else if (argv[i] === "--seed") args.seed = Number(argv[++i]);
  }
  return args;
}

export function dispatchRead(path, parsed, graph) {
  if (
    parsed.request_type !== "read" ||
    !parsed.query ||
    Object.keys(parsed.query).length !== (path === "/v2/query" ? 1 : 2)
  )
    throw new UnsupportedStep("invalid read envelope");
  if (path === "/v2/query" && !parsed.query.read)
    throw new UnsupportedStep("v2 requires a nested read batch");
  if (path === "/v1/query" && !parsed.query.queries)
    throw new UnsupportedStep("v1 requires a flat query batch");
  if (!["/v1/query", "/v2/query"].includes(path))
    throw new UnsupportedStep("unknown query endpoint");
  return path === "/v1/query"
    ? runFlatBatch(parsed, graph)
    : runBatch(parsed, graph);
}

export function createMockServer({ seed = 42 } = {}) {
  const graph = buildGraph(seed);

  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://mock.local").pathname.replace(
      /\/$/,
      "",
    );
    if (
      request.method !== "POST" ||
      !["/v1/query", "/v2/query"].includes(path)
    ) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: "not_found",
          msg: "this mock serves POST /v1/query and /v2/query",
        }),
      );
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        const parsed = parseJsonBig(body);
        if (["true", "1"].includes(request.headers["x-helix-await-durable"]))
          throw new UnsupportedStep("durability wait is invalid on reads");
        const result = dispatchRead(path, parsed, graph);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(stringifyBig(result));
      } catch (error) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ error: "invalid_query_json", msg: error.message }),
        );
      }
    });
  });

  return { server, graph };
}

// Only listen when run directly, so tests can import and drive the server.
if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split("/").pop())
) {
  const { port, seed } = parseArgs(process.argv.slice(2));
  const { server, graph } = createMockServer({ seed });
  server.listen(port, () => {
    console.log(
      `mock HelixDB listening on http://localhost:${port} ` +
        `(${graph.nodes.size} nodes, ${graph.edges.size} edges, seed ${seed})`,
    );
    console.log(
      "this is a stand-in for development — not a HelixDB implementation",
    );
  });
}
