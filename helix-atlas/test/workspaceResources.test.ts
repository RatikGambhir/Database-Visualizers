// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BackendError,
  type QueryExecution,
  type SchemaResponse,
} from "../src/client";
import { api, connectWorkspace, mountWorkspace } from "./support/workspace";
import {
  deferred,
  detail,
  execution,
  graph,
  initialSource,
  schema,
} from "./support/fixtures";

describe("inspector and schema requests", () => {
  it("keeps the latest selection when detail requests resolve out of order", async () => {
    const old = deferred<QueryExecution>();
    const hook = await mountWorkspace();
    api.runQuery
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(execution({ ...detail, id: "2" }));
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.inspect("node", "1");
    });
    await act(async () => {
      await hook.result.current.inspect("edge", "2");
    });
    await act(async () => {
      old.resolve(execution({ ...detail, id: "1" }));
      await first;
    });
    expect(api.runQuery).toHaveBeenLastCalledWith("DESCRIBE EDGE 2");
    expect(hook.result.current.detail?.id).toBe("2");
    expect(hook.result.current.selectedId).toBe("2");
    expect(hook.result.current.detailLoading).toBe(false);
  });

  it("clears detail on an unexpected result and exposes inspector errors", async () => {
    const hook = await mountWorkspace();
    api.runQuery.mockResolvedValue(execution());
    await act(async () => {
      await hook.result.current.inspect("node", "1");
    });
    expect(hook.result.current.detail).toBeNull();
    api.runQuery.mockRejectedValue(new Error("detail failed"));
    await act(async () => {
      await hook.result.current.inspect("node", "1");
    });
    expect(hook.result.current.detailError).toBe("detail failed");
    expect(hook.result.current.detailLoading).toBe(false);
  });

  it.each(["success", "failure"])(
    "ignores inspector %s after disconnect",
    async (outcome) => {
      const pending = deferred<QueryExecution>();
      const hook = await mountWorkspace();
      api.runQuery.mockReturnValue(pending.promise);
      let inspecting!: Promise<void>;
      act(() => {
        inspecting = hook.result.current.inspect("node", "0");
      });
      act(() => hook.result.current.disconnect());
      await act(async () => {
        outcome === "success"
          ? pending.resolve(execution(detail))
          : pending.reject(new Error("late failure"));
        await inspecting;
      });
      expect(hook.result.current.detail).toBeNull();
      expect(hook.result.current.detailError).toBeNull();
      expect(hook.result.current.detailLoading).toBe(false);
      expect(hook.result.current.selectedId).toBeNull();
    },
  );

  it("ignores an older schema response and keeps the latest sample", async () => {
    const old = deferred<SchemaResponse>();
    const hook = await mountWorkspace();
    api.loadSchema
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({
        schema: { ...schema, sample: 10 },
        durationMs: 2,
        connectionRevision: 1,
      });
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.refreshSchema();
    });
    await act(async () => {
      await hook.result.current.refreshSchema();
    });
    await act(async () => {
      old.resolve({ schema, durationMs: 1, connectionRevision: 1 });
      await first;
    });
    expect(hook.result.current.schema?.sample).toBe(10);
    expect(hook.result.current.schemaLoading).toBe(false);
  });

  it("does not restore schema or connected status after disconnect", async () => {
    const pending = deferred<SchemaResponse>();
    const hook = await mountWorkspace();
    api.loadSchema.mockReturnValue(pending.promise);
    let refreshing!: Promise<void>;
    act(() => {
      refreshing = hook.result.current.refreshSchema();
    });
    act(() => hook.result.current.disconnect());
    await act(async () => {
      pending.resolve({ schema, durationMs: 1, connectionRevision: 1 });
      await refreshing;
    });
    expect(hook.result.current.schema).toBeNull();
    expect(hook.result.current.status.kind).toBe("disconnected");
  });
});

describe("graph snapshots", () => {
  it("loads a connected graph once without replacing the editor draft", async () => {
    const hook = await mountWorkspace();
    await connectWorkspace(hook);
    api.runQuery.mockResolvedValue(execution({ kind: "graph", graph }));
    await act(async () => {
      hook.result.current.setView("graph");
    });
    expect(api.runQuery).toHaveBeenCalledExactlyOnceWith(initialSource);
    expect(hook.result.current.graph).toEqual(graph);
    expect(hook.result.current.query).toBe(initialSource);
    await act(async () => {
      hook.result.current.setView("query");
    });
    await act(async () => {
      hook.result.current.setView("graph");
    });
    expect(api.runQuery).toHaveBeenCalledTimes(1);
  });

  it("does not loop on graph failures and permits an explicit retry", async () => {
    const hook = await mountWorkspace();
    await connectWorkspace(hook);
    api.runQuery
      .mockRejectedValueOnce(new BackendError("offline", { kind: "transport" }))
      .mockResolvedValue(execution({ kind: "graph", graph }));
    await act(async () => {
      hook.result.current.setView("graph");
    });
    expect(api.runQuery).toHaveBeenCalledTimes(1);
    expect(hook.result.current.graphError).toBe("offline");
    expect(hook.result.current.graphLoading).toBe(false);
    await act(async () => {
      hook.result.current.refreshCurrentGraph();
    });
    expect(api.runQuery).toHaveBeenCalledTimes(2);
    expect(hook.result.current.graphError).toBeNull();
    expect(hook.result.current.graph).toEqual(graph);
  });

  it("rejects a non-graph snapshot and ignores a late graph after disconnect", async () => {
    const hook = await mountWorkspace();
    await connectWorkspace(hook);
    await act(async () => {
      hook.result.current.setView("graph");
    });
    expect(hook.result.current.graphError).toContain("non-graph");
    const pending = deferred<QueryExecution>();
    api.runQuery.mockReturnValue(pending.promise);
    act(() => hook.result.current.refreshCurrentGraph());
    act(() => hook.result.current.disconnect());
    await act(async () => pending.resolve(execution({ kind: "graph", graph })));
    expect(hook.result.current.graph).toBeNull();
    expect(hook.result.current.status.kind).toBe("disconnected");
  });

  it("does not let an older automatic snapshot overwrite a manual graph query", async () => {
    const old = deferred<QueryExecution>();
    const hook = await mountWorkspace();
    await connectWorkspace(hook);
    api.runQuery
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(execution({ kind: "graph", graph }));
    act(() => hook.result.current.setView("graph"));
    await act(async () => {
      await hook.result.current.onRun();
    });
    await act(async () =>
      old.resolve(execution({ kind: "graph", graph: { ...graph, nodes: [] } })),
    );
    expect(hook.result.current.graph).toEqual(graph);
  });
});
