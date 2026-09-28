export class UnsupportedStep extends Error {}

/** One entity flowing through a traversal, tagged with what it is. */
export const asNode = (node) => ({ kind: "node", entity: node });
export const asEdge = (edge) => ({ kind: "edge", entity: edge });

export function resolveField(item, source, graph) {
  const { kind, entity } = item;
  if (source === "$id") return entity.id;
  if (source === "$label") return entity.label;
  if (kind === "edge") {
    if (source === "$from.$id" || source === "$from") return entity.from;
    if (source === "$to.$id" || source === "$to") return entity.to;
    if (source === "$from.$label")
      return graph.nodes.get(entity.from)?.label ?? null;
    if (source === "$to.$label")
      return graph.nodes.get(entity.to)?.label ?? null;
  }
  const value = entity.properties[source];
  return value === undefined ? null : value;
}
/** Numeric-aware comparison that treats i64 and f64 as the same number line. */
export function compareValues(left, right) {
  if (
    left === null ||
    right === null ||
    left === undefined ||
    right === undefined
  )
    return NaN;
  if (typeof left === "bigint" || typeof right === "bigint") {
    const a =
      typeof left === "bigint" ? left : BigInt(Math.trunc(Number(left)));
    const b =
      typeof right === "bigint" ? right : BigInt(Math.trunc(Number(right)));
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof left === "number" && typeof right === "number")
    return left - right;
  if (typeof left === "boolean" || typeof right === "boolean") {
    return Number(left) - Number(right);
  }
  return String(left).localeCompare(String(right));
}

export const valuesEqual = (a, b) => compareValues(a, b) === 0;
export function validateBatch(batch, version) {
  if (
    !batch ||
    !Array.isArray(batch.returns) ||
    !Array.isArray(version === "v2" ? batch.entries : batch.queries)
  )
    throw new UnsupportedStep("malformed batch");
  const names = new Set();
  for (const entry of version === "v2" ? batch.entries : batch.queries) {
    const query = version === "v2" ? entry.query : entry.Query;
    if (
      Object.keys(entry).length !== 1 ||
      !query ||
      typeof query.name !== "string" ||
      names.has(query.name)
    )
      throw new UnsupportedStep("invalid named entry");
    if (
      version === "v2"
        ? !query.root || query.steps !== undefined
        : !Array.isArray(query.steps) || query.root !== undefined
    )
      throw new UnsupportedStep("cross-version query entry");
    names.add(query.name);
  }
  if (
    batch.returns.some((name) => typeof name !== "string" || !names.has(name))
  )
    throw new UnsupportedStep("missing return binding");
}
