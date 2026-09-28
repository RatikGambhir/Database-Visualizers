/** Operation-tree predicates and typed constants. */
import {
  UnsupportedStep,
  resolveField,
  compareValues,
  valuesEqual,
} from "./shared.mjs";

function evaluateOperand(operand, item, graph) {
  if (operand === null || operand === undefined) return null;
  if ("property" in operand) return resolveField(item, operand.property, graph);
  if ("constant" in operand) return readConstant(operand.constant);
  throw new UnsupportedStep(`operand ${JSON.stringify(operand)}`);
}

function readConstant(constant) {
  if (constant === null || constant === "null") return null;
  if (typeof constant !== "object") return constant;
  for (const key of ["string", "bool", "f64", "f32"]) {
    if (key in constant) return constant[key];
  }
  if ("i64" in constant) {
    const value = constant.i64;
    return typeof value === "bigint" ? value : BigInt(value);
  }
  if ("array" in constant) return constant.array.map(readConstant);
  if ("null" in constant) return null;
  throw new UnsupportedStep(`constant ${JSON.stringify(constant)}`);
}
export function evaluatePredicate(predicate, item, graph) {
  const [key] = Object.keys(predicate);
  const body = predicate[key];

  switch (key) {
    case "and":
      return body.predicates.every((part) =>
        evaluatePredicate(part, item, graph),
      );
    case "or":
      return body.predicates.some((part) =>
        evaluatePredicate(part, item, graph),
      );
    case "not":
      return !evaluatePredicate(body.predicate ?? body, item, graph);

    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const left = evaluateOperand(body.left, item, graph);
      const right = evaluateOperand(body.right, item, graph);
      if (key === "eq") return valuesEqual(left, right);
      if (key === "neq") return !valuesEqual(left, right);
      const order = compareValues(left, right);
      if (Number.isNaN(order)) return false;
      if (key === "gt") return order > 0;
      if (key === "gte") return order >= 0;
      if (key === "lt") return order < 0;
      return order <= 0;
    }

    case "between": {
      const value = evaluateOperand(
        body.value ?? { property: body.property },
        item,
        graph,
      );
      const low = evaluateOperand(body.min ?? body.low, item, graph);
      const high = evaluateOperand(body.max ?? body.high, item, graph);
      return compareValues(value, low) >= 0 && compareValues(value, high) <= 0;
    }

    case "is_in": {
      const value = evaluateOperand(body.value, item, graph);
      const values = evaluateOperand(body.values, item, graph);
      return (
        Array.isArray(values) &&
        values.some((candidate) => valuesEqual(value, candidate))
      );
    }

    case "starts_with":
    case "ends_with":
    case "contains": {
      const value = evaluateOperand(body.value, item, graph);
      const needle = evaluateOperand(
        body.prefix ?? body.suffix ?? body.substring ?? body.value2,
        item,
        graph,
      );
      if (typeof value !== "string" || typeof needle !== "string") return false;
      if (key === "starts_with") return value.startsWith(needle);
      if (key === "ends_with") return value.endsWith(needle);
      return value.includes(needle);
    }

    case "is_null":
    case "is_not_null":
    case "has_key": {
      const name = typeof body === "string" ? body : body.property;
      const raw =
        name.startsWith("$") || item.entity.properties[name] !== undefined
          ? resolveField(item, name, graph)
          : undefined;
      const present = raw !== undefined && raw !== null;
      if (key === "is_null") return !present;
      if (key === "has_key")
        return (
          name.startsWith("$") || Object.hasOwn(item.entity.properties, name)
        );
      return present;
    }

    default:
      throw new UnsupportedStep(`predicate "${key}"`);
  }
}
