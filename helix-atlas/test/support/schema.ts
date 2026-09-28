import type { Schema, SchemaLabel } from "../../src/schema";

export function label(
  name: string,
  overrides: Partial<SchemaLabel> = {},
): SchemaLabel {
  return {
    label: name,
    count: 2,
    browseQuery: `SELECT * FROM NODES:${name}`,
    graphQuery: `QUERY FROM NODES:${name}`,
    fieldSample: 2,
    fields: [],
    ...overrides,
  };
}
export const populatedSchema: Schema = {
  sample: 5000,
  nodeLabels: [
    label("User", {
      fields: [
        {
          name: "name",
          types: ["string"],
          values: ["Alice", "Bob"],
          presentOn: 2,
        },
      ],
    }),
    label("Post", { fieldError: "sample timed out" }),
  ],
  edgeLabels: [
    label("Follows", {
      browseQuery: "SELECT * FROM EDGES:Follows",
      graphQuery: "QUERY FROM EDGES:Follows",
    }),
  ],
};
