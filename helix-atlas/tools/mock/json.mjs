// Node 22+ exposes integer token text to JSON revivers and raw JSON values to
// stringify. Strings never pass through a numeric regex or sentinel decoder.
export function parseJsonBig(text) {
  return JSON.parse(text, (_key, value, context) =>
    typeof value === "number" &&
    /^-?\d+$/.test(context?.source ?? "") &&
    !Number.isSafeInteger(value)
      ? BigInt(context.source)
      : value,
  );
}
export function stringifyBig(value) {
  return JSON.stringify(value, (_key, inner) =>
    typeof inner === "bigint" ? JSON.rawJSON(inner.toString()) : inner,
  );
}
