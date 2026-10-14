import { BackendError, type Parameters, type ParameterValue } from "../client";

export interface ParameterDraft {
  id: number;
  name: string;
  type: ParameterValue["type"];
  value: string;
}

/** Form conversion only. Rust owns SQL, integer bounds and contextual typing. */
export function parameterValues(rows: ParameterDraft[]): Parameters {
  const values: Parameters = Object.create(null) as Parameters;
  for (const row of rows) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(row.name)) {
      throw new BackendError("Parameter names use ASCII letters, digits and underscores, and cannot start with a digit.");
    }
    if (Object.hasOwn(values, row.name)) throw new BackendError(`Duplicate parameter :${row.name}`);
    switch (row.type) {
      case "float": {
        const value = Number(row.value);
        if (!row.value.trim() || !Number.isFinite(value)) throw new BackendError(`:${row.name} requires a finite float.`);
        values[row.name] = { type: "float", value };
        break;
      }
      case "boolean":
        values[row.name] = { type: "boolean", value: row.value === "true" };
        break;
      case "null": values[row.name] = { type: "null" }; break;
      default: values[row.name] = { type: row.type, value: row.value };
    }
  }
  return values;
}
