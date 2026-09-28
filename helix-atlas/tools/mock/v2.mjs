/** Operation-tree traversal evaluation for v2 reads. */
import {
  UnsupportedStep,
  asNode,
  asEdge,
  resolveField,
  compareValues,
  validateBatch,
} from "./shared.mjs";
import { evaluatePredicate } from "./predicates.mjs";
import { stringifyBig } from "./json.mjs";

/** Runs a traversal AST, returning either a stream of items or a terminal value. */
function evaluate(node, graph, variables = {}) {
  if (!node || typeof node !== "object" || Object.keys(node).length !== 1)
    throw new UnsupportedStep("malformed operation tree");
  const [step] = Object.keys(node);
  const body = node[step];

  if (step === "inject") {
    if (
      body.input !== undefined ||
      typeof body.variable !== "string" ||
      !variables[body.variable]?.stream
    )
      throw new UnsupportedStep("invalid stream binding");
    return { stream: [...variables[body.variable].stream], atMostOne: false };
  }
  // Source steps.
  if (step === "nodes" || step === "edges") {
    const table = step === "nodes" ? graph.nodes : graph.edges;
    const wrap = step === "nodes" ? asNode : asEdge;
    const reference = body.reference;
    if (reference === "all") return { stream: [...table.values()].map(wrap) };
    if (reference && "ids" in reference) {
      const ids = reference.ids.map((id) =>
        typeof id === "bigint" ? id : BigInt(id),
      );
      return {
        stream: ids
          .map((id) => table.get(id))
          .filter(Boolean)
          .map(wrap),
        atMostOne: ids.length <= 1,
      };
    }
    throw new UnsupportedStep(`${step} reference ${JSON.stringify(reference)}`);
  }
  if (step === "nodes_where" || step === "edges_where") {
    const table = step === "nodes_where" ? graph.nodes : graph.edges;
    const wrap = step === "nodes_where" ? asNode : asEdge;
    const stream = [...table.values()]
      .map(wrap)
      .filter((item) => evaluatePredicate(body.predicate, item, graph));
    return { stream };
  }

  const input = evaluate(body.input, graph, variables);
  const outcome = applyStep(step, body, input, graph);
  const expands = [
    "out",
    "in",
    "both",
    "out_e",
    "in_e",
    "both_e",
    "other_n",
  ].includes(step);
  outcome.atMostOne = expands
    ? false
    : input.atMostOne || (step === "limit" && readBound(body.count) <= 1);
  return outcome;
}

export function applyStep(step, body, input, graph, legacy = false) {
  if (input.stream === undefined) {
    throw new UnsupportedStep(`step "${step}" applied to a terminal value`);
  }
  const stream = input.stream;

  switch (step) {
    case "where":
      return {
        stream: stream.filter((item) =>
          evaluatePredicate(body.predicate, item, graph),
        ),
      };

    case "dedup": {
      const seen = new Set();
      return {
        stream: stream.filter((item) => {
          const key = `${item.kind}:${item.entity.id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      };
    }

    case "limit":
      return { stream: stream.slice(0, Number(readBound(body.count))) };
    case "skip":
      return { stream: stream.slice(Number(readBound(body.count))) };

    case "order_by_multiple": {
      if (
        !Array.isArray(body.orderings) ||
        body.orderings.some(
          (term) =>
            !Array.isArray(term) ||
            term.length !== 2 ||
            !["asc", "desc"].includes(term[1]),
        )
      )
        throw new UnsupportedStep("invalid ordered keys");
      return {
        stream: [...stream].sort((a, b) => {
          for (const [property, direction] of body.orderings) {
            const left = resolveField(a, property, graph),
              right = resolveField(b, property, graph);
            const order =
              left == null && right == null
                ? 0
                : left == null
                  ? -1
                  : right == null
                    ? 1
                    : compareValues(left, right);
            if (order && !Number.isNaN(order))
              return order * (direction === "desc" ? -1 : 1);
          }
          return a.entity.id < b.entity.id
            ? -1
            : a.entity.id > b.entity.id
              ? 1
              : 0;
        }),
      };
    }

    case "order_by": {
      const direction = (body.order ?? "asc") === "desc" ? -1 : 1;
      const property = body.property;
      return {
        stream: [...stream].sort((a, b) => {
          const order = compareValues(
            resolveField(a, property, graph),
            resolveField(b, property, graph),
          );
          return direction * (Number.isNaN(order) ? 0 : order);
        }),
      };
    }

    case "out":
    case "in":
    case "both": {
      const out = [];
      for (const item of stream) {
        const visited = new Set();
        const adjacent = [];
        const add = (node) => {
          if (node && (legacy || !visited.has(node.id))) {
            visited.add(node.id);
            adjacent.push(asNode(node));
          }
        };
        for (const edge of graph.edges.values()) {
          if (body.label && edge.label !== body.label) continue;
          if (
            (step === "out" || step === "both") &&
            edge.from === item.entity.id
          ) {
            const node = graph.nodes.get(edge.to);
            add(node);
          }
          if (
            (step === "in" || step === "both") &&
            edge.to === item.entity.id
          ) {
            const node = graph.nodes.get(edge.from);
            add(node);
          }
        }
        if (!legacy)
          adjacent.sort((a, b) =>
            a.entity.id < b.entity.id ? -1 : a.entity.id > b.entity.id ? 1 : 0,
          );
        out.push(...adjacent);
      }
      return { stream: out };
    }

    case "out_e":
    case "in_e":
    case "both_e": {
      const out = [];
      for (const item of stream) {
        for (const edge of graph.edges.values()) {
          if (body.label && edge.label !== body.label) continue;
          const outgoing = edge.from === item.entity.id;
          const incoming = edge.to === item.entity.id;
          const matches =
            (step === "out_e" && outgoing) ||
            (step === "in_e" && incoming) ||
            (step === "both_e" && (outgoing || incoming));
          if (matches) out.push(asEdge(edge));
        }
      }
      return { stream: out };
    }

    case "out_n":
    case "in_n":
    case "other_n": {
      const out = [];
      for (const item of stream) {
        if (item.kind !== "edge") continue;
        const ids =
          step === "in_n"
            ? [item.entity.from]
            : step === "out_n"
              ? [item.entity.to]
              : [item.entity.from, item.entity.to];
        for (const id of ids) {
          const node = graph.nodes.get(id);
          if (node) out.push(asNode(node));
        }
      }
      return { stream: out };
    }

    case "count":
      return { value: stream.length };
    case "id":
      return { value: stream.map((item) => item.entity.id) };
    case "label":
      return { value: stream.map((item) => item.entity.label) };

    case "group_count": {
      const counts = new Map();
      for (const item of stream) {
        const key = resolveField(item, body.property, graph);
        const text = stringifyBig(key);
        const group = counts.get(text) ?? { [body.property]: key, count: 0 };
        group.count += 1;
        counts.set(text, group);
      }
      return {
        value: [...counts.values()].sort((a, b) => {
          const left = a[body.property],
            right = b[body.property];
          return left == null && right == null
            ? 0
            : left == null
              ? -1
              : right == null
                ? 1
                : compareValues(left, right);
        }),
      };
    }

    case "value_map": {
      const properties = body.properties ?? null;
      return {
        value: stream.map((item) => {
          if (properties === null)
            return {
              ...item.entity.properties,
              $id: item.entity.id,
              $label: item.entity.label,
            };
          const row = {};
          for (const name of properties)
            row[name] = resolveField(item, name, graph);
          return row;
        }),
      };
    }

    case "project": {
      return {
        value: stream.map((item) => {
          const row = {};
          for (const projection of body.projections) {
            const { source, alias } = projection.property;
            row[alias] = resolveField(item, source, graph);
          }
          return row;
        }),
      };
    }

    default:
      throw new UnsupportedStep(`step "${step}"`);
  }
}

function readBound(bound) {
  if (bound === null || bound === undefined) return 0;
  if (typeof bound === "number" || typeof bound === "bigint") return bound;
  if ("literal" in bound) return bound.literal;
  throw new UnsupportedStep(`bound ${JSON.stringify(bound)}`);
}

/** Runs one read batch and returns the map of returned variables. */
export function runBatch(request, graph) {
  validateBatch(request.query.read, "v2");
  const batch = request.query?.read ?? request.query?.write;
  if (!batch)
    throw new UnsupportedStep("request without a read or write batch");
  if (!request.query.read)
    throw new UnsupportedStep("write batches (this mock is read-only)");

  const variables = {};
  for (const entry of batch.entries) {
    if (!entry.query) throw new UnsupportedStep("for_each entries");
    const outcome = evaluate(entry.query.root, graph, variables);
    variables[entry.query.name] = outcome;
  }

  const response = {};
  for (const name of batch.returns) {
    const outcome = variables[name];
    const value =
      "value" in outcome
        ? outcome.value
        : outcome.stream.map((i) => ({ $id: i.entity.id }));
    response[name] =
      Array.isArray(value) && value.length === 0 && outcome.atMostOne
        ? null
        : value;
  }
  return response;
}
