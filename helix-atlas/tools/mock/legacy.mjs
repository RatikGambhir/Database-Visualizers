/** Legacy flat read adapter. */
import {
  UnsupportedStep,
  asNode,
  asEdge,
  resolveField,
  compareValues,
  valuesEqual,
  validateBatch,
} from "./shared.mjs";
import { applyStep } from "./v2.mjs";

function readFlatValue(value) {
  if (value === "Null" || value === null) return null;
  if (typeof value !== "object") return value;
  for (const key of ["String", "Bool", "F64", "F32", "I64"]) {
    if (key in value) return value[key];
  }
  for (const key of ["StringArray", "I64Array", "Array"]) {
    if (key in value) return value[key].map(readFlatValue);
  }
  throw new UnsupportedStep(`flat value ${JSON.stringify(value)}`);
}

function evaluateFlatPredicate(predicate, item, graph) {
  const [kind] = Object.keys(predicate);
  const body = predicate[kind];
  if (kind === "And")
    return body.every((part) => evaluateFlatPredicate(part, item, graph));
  if (kind === "Or")
    return body.some((part) => evaluateFlatPredicate(part, item, graph));
  if (kind === "Not") return !evaluateFlatPredicate(body, item, graph);
  if (["Eq", "Neq", "Gt", "Gte", "Lt", "Lte"].includes(kind)) {
    const [property, operand] = body;
    const left = resolveField(item, property, graph);
    const right = readFlatValue(operand);
    if (kind === "Eq") return valuesEqual(left, right);
    if (kind === "Neq") return !valuesEqual(left, right);
    const order = compareValues(left, right);
    if (Number.isNaN(order)) return false;
    if (kind === "Gt") return order > 0;
    if (kind === "Gte") return order >= 0;
    if (kind === "Lt") return order < 0;
    return order <= 0;
  }
  if (kind === "Between") {
    const [property, low, high] = body;
    const value = resolveField(item, property, graph);
    return (
      compareValues(value, readFlatValue(low)) >= 0 &&
      compareValues(value, readFlatValue(high)) <= 0
    );
  }
  if (kind === "IsIn") {
    const [property, values] = body;
    return readFlatValue(values).some((candidate) =>
      valuesEqual(resolveField(item, property, graph), candidate),
    );
  }
  if (["StartsWith", "EndsWith", "Contains"].includes(kind)) {
    const [property, operand] = body;
    const value = resolveField(item, property, graph);
    const needle = readFlatValue(operand);
    if (typeof value !== "string" || typeof needle !== "string") return false;
    if (kind === "StartsWith") return value.startsWith(needle);
    if (kind === "EndsWith") return value.endsWith(needle);
    return value.includes(needle);
  }
  if (["IsNull", "IsNotNull", "HasKey"].includes(kind)) {
    const value = resolveField(item, body, graph);
    const present = value !== undefined && value !== null;
    return kind === "IsNull" ? !present : present;
  }
  throw new UnsupportedStep(`flat predicate "${kind}"`);
}

function flatEntityRow(item) {
  if (item.kind === "edge") {
    return {
      ...item.entity.properties,
      $id: item.entity.id,
      $label: item.entity.label,
      $from: item.entity.from,
      $to: item.entity.to,
    };
  }
  return {
    ...item.entity.properties,
    $id: item.entity.id,
    $label: item.entity.label,
  };
}

function flatSource(kind, body, graph) {
  const nodes = kind.startsWith("N");
  const table = nodes ? graph.nodes : graph.edges;
  const wrap = nodes ? asNode : asEdge;
  let stream;
  if (body === "All") stream = [...table.values()].map(wrap);
  else if (body && body.Ids)
    stream = body.Ids.map((id) => table.get(BigInt(id)))
      .filter(Boolean)
      .map(wrap);
  else stream = [...table.values()].map(wrap);
  if (kind.endsWith("Where"))
    stream = stream.filter((item) => evaluateFlatPredicate(body, item, graph));
  return { stream };
}

function applyFlatStep(step, input, graph) {
  if (step === "Dedup") return applyStep("dedup", {}, input, graph);
  if (step === "Count") return applyStep("count", {}, input, graph);
  if (step === "EdgeProperties")
    return { value: input.stream.map(flatEntityRow) };

  const [kind] = Object.keys(step);
  const body = step[kind];
  if (["N", "E", "NWhere", "EWhere"].includes(kind))
    return flatSource(kind, body, graph);
  if (kind === "Where")
    return {
      stream: input.stream.filter((item) =>
        evaluateFlatPredicate(body, item, graph),
      ),
    };
  if (kind === "ValueMap") return { value: input.stream.map(flatEntityRow) };
  if (kind === "Limit")
    return applyStep("limit", { count: body }, input, graph);
  if (kind === "Skip") return applyStep("skip", { count: body }, input, graph);
  if (kind === "OrderBy")
    return applyStep(
      "order_by",
      { property: body[0], order: body[1].toLowerCase() },
      input,
      graph,
    );
  if (kind === "GroupCount") {
    const rows = applyStep(
      "group_count",
      { property: body },
      input,
      graph,
    ).value;
    return {
      value: Object.fromEntries(
        rows.map((row) => [String(row[body] ?? ""), row.count]),
      ),
    };
  }

  const traversal = {
    Out: "out",
    In: "in",
    Both: "both",
    OutE: "out_e",
    InE: "in_e",
    BothE: "both_e",
    OutN: "in_n",
    InN: "out_n",
    OtherN: "other_n",
  }[kind];
  if (traversal)
    return applyStep(traversal, { label: body }, input, graph, true);
  throw new UnsupportedStep(`flat step "${kind}"`);
}

export function runFlatBatch(request, graph) {
  validateBatch(request.query, "v1");
  if (request.request_type !== "read")
    throw new UnsupportedStep("write requests (this mock is read-only)");
  const variables = {};
  for (const entry of request.query?.queries ?? []) {
    const query = entry.Query;
    if (!query) throw new UnsupportedStep("non-query flat entries");
    let outcome = { stream: [] };
    for (const step of query.steps)
      outcome = applyFlatStep(step, outcome, graph);
    variables[query.name] =
      "value" in outcome ? outcome.value : outcome.stream.map(flatEntityRow);
  }
  const response = {};
  for (const name of request.query?.returns ?? [])
    response[name] = variables[name];
  return response;
}
