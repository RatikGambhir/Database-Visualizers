import { afterEach, describe, expect, it } from "vitest";
import {
  createMockServer,
  parseJsonBig,
  stringifyBig,
} from "../tools/mock-helix-server.mjs";
import type { Server } from "node:http";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.closeAllConnections();
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});
async function serve() {
  const { server } = createMockServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("missing TCP address");
  return `http://127.0.0.1:${address.port}`;
}
const query = {
  request_type: "read",
  query: {
    read: {
      entries: [
        {
          query: {
            name: "rows",
            root: {
              value_map: {
                input: { nodes: { reference: { ids: [1] } } },
                properties: null,
              },
            },
          },
        },
      ],
      returns: ["rows"],
    },
  },
};

describe("mock HTTP service", () => {
  it("serves exact integer JSON over a real request, including the trailing slash route", async () => {
    const url = await serve();
    const response = await fetch(`${url}/v2/query/`, {
      method: "POST",
      body: stringifyBig(query),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    const result = parseJsonBig(await response.text());
    expect(result.rows[0].externalId).toBe(9223372036854775807n);
    expect(result.rows[0].name).toBe("Alice");
  });
  it.each([
    ["GET", "/v2/query"],
    ["POST", "/unknown"],
  ])("rejects unsupported route %s %s", async (method, path) => {
    const url = await serve();
    const response = await fetch(url + path, { method });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found" });
  });
  it.each([
    "{bad",
    stringifyBig({ ...query, request_type: "write" }),
    stringifyBig({
      request_type: "read",
      query: { read: { entries: [], returns: ["missing"] } },
    }),
  ])("returns structured HTTP 400 for malformed input %s", async (body) => {
    const url = await serve();
    const response = await fetch(url + "/v2/query", { method: "POST", body });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "invalid_query_json",
      msg: expect.any(String),
    });
  });
  it("rejects read requests asking for durability waits", async () => {
    const url = await serve();
    const response = await fetch(url + "/v2/query", {
      method: "POST",
      body: stringifyBig(query),
      headers: { "x-helix-await-durable": "true" },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      msg: expect.stringContaining("durability"),
    });
  });
});
