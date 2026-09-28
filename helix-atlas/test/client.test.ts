import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  BackendError,
  compileQuery,
  getConnection,
  isDesktop,
  loadSchema,
  runQuery,
  setConnection,
  testConnection,
} from "../src/client";
import { update } from "./support/fixtures";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const ipc = vi.mocked(invoke);
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("typed IPC boundary", () => {
  it("uses stable command names and exact argument keys", async () => {
    ipc.mockResolvedValue({});
    await getConnection();
    await setConnection(update);
    await compileQuery("SELECT");
    await runQuery("QUERY");
    await testConnection(update);
    await loadSchema();
    expect(ipc.mock.calls).toEqual([
      ["get_connection", undefined],
      ["set_connection", { update }],
      ["compile_query", { source: "SELECT" }],
      ["run_query", { source: "QUERY" }],
      ["test_connection", { connection: update }],
      ["load_schema", undefined],
    ]);
  });

  it("preserves structured HTTP and source diagnostics", async () => {
    const span = { start: 2, end: 5, line: 1, column: 3 };
    ipc.mockRejectedValue({
      kind: "http",
      message: "bad request",
      detail: "wire diagnostic",
      hint: "retry",
      status: 400,
      code: "invalid_query",
      span,
    });
    await expect(runQuery("QUERY")).rejects.toMatchObject({
      name: "BackendError",
      kind: "http",
      message: "bad request",
      detail: "wire diagnostic",
      hint: "retry",
      status: 400,
      code: "invalid_query",
      span,
    });
  });

  it.each(["a string failure", new Error("native failure"), null, 42])(
    "normalizes an unstructured failure: %s",
    async (error) => {
      ipc.mockRejectedValue(error);
      await expect(getConnection()).rejects.toBeInstanceOf(BackendError);
      await expect(getConnection()).rejects.toHaveProperty(
        "message",
        error instanceof Error ? error.message : String(error),
      );
    },
  );

  it("passes through an existing BackendError and ignores malformed metadata", async () => {
    const known = new BackendError("known", { kind: "hql" });
    ipc.mockRejectedValueOnce(known);
    await expect(compileQuery("bad")).rejects.toBe(known);
    ipc.mockRejectedValue({
      message: "unknown",
      status: "400",
      code: 4,
      span: { start: 0, end: 1 },
      hint: [],
      detail: {},
      kind: true,
    });
    await expect(compileQuery("bad")).rejects.toMatchObject({
      kind: "backend",
      status: null,
      code: null,
      span: null,
      hint: null,
      detail: null,
    });
  });

  it("distinguishes the desktop bridge from browser and server environments", () => {
    expect(isDesktop()).toBe(false);
    vi.stubGlobal("window", {});
    expect(isDesktop()).toBe(false);
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    expect(isDesktop()).toBe(true);
  });
});
