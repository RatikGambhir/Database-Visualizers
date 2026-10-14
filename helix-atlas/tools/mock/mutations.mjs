/** Staged insertion model for the captured Atlas server extension, not a concurrency proof. */
import { evaluate } from "./v2.mjs";
import { UnsupportedStep, validateBatch } from "./shared.mjs";

export function runWriteBatch(request, graph) {
  if (request.request_type !== "write" || Object.keys(request.query ?? {}).length !== 1 || !request.query.write) throw new UnsupportedStep("invalid write envelope");
  const batch = request.query.write;
  validateBatch(batch, "v2");
  const next = (table) => [...table.keys()].reduce((value, id) => id >= value ? id + 1n : value, 0n);
  graph.allocators ??= { nodes: next(graph.nodes), edges: next(graph.edges) };
  // Allocation gaps survive rollback, like the real server's ID leases.
  const staged = { nodes: new Map(graph.nodes), edges: new Map(graph.edges), allocators: graph.allocators };
  const variables = Object.create(null);
  for (const { query } of batch.entries) {
    if (query.condition) {
      const condition = query.condition;
      if (Object.keys(condition).length !== 1 || typeof condition.require_single_node !== "string") throw new UnsupportedStep("unsupported mutation assertion");
      const stream = variables[condition.require_single_node]?.stream;
      if (!stream || stream.length !== 1 || stream[0].kind !== "node") {
        const error = new UnsupportedStep(`db error: Query error: atlas_single_node: \`${condition.require_single_node}\` requires exactly one node, found ${stream?.length ?? 0}`);
        error.rollback = true;
        throw error;
      }
    }
    variables[query.name] = evaluate(query.root, staged, variables, true);
  }
  const response = Object.create(null);
  for (const name of batch.returns) {
    const outcome = variables[name];
    response[name] = "value" in outcome ? outcome.value : outcome.stream.map((item) => ({ $id: item.entity.id }));
  }
  graph.nodes = staged.nodes;
  graph.edges = staged.edges;
  return response;
}
