// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackendError, type QueryExecution } from "../src/client";
import {
  api,
  compileDraft,
  connectWorkspace,
  mountWorkspace,
} from "./support/workspace";
import {
  deferred,
  detail,
  execution,
  graph,
  initialSource,
} from "./support/fixtures";

describe("query execution", () => {
  it("requires both a valid compile and a connected session", async () => {
    const hook = await mountWorkspace();
    await act(async () => {
      await hook.result.current.onRun();
    });
    expect(api.runQuery).not.toHaveBeenCalled();
    await compileDraft();
    await act(async () => {
      await hook.result.current.onRun();
    });
    expect(hook.result.current.run.error?.message).toContain("Connect");
    expect(api.runQuery).not.toHaveBeenCalled();
  });

  it.each(["rows", "graph", "describe"])(
    "routes %s results to the right workspace",
    async (kind) => {
      const hook = await mountWorkspace();
      await connectWorkspace(hook);
      const result =
        kind === "graph"
          ? { kind: "graph" as const, graph }
          : kind === "describe"
            ? detail
            : {
                kind: "rows" as const,
                columns: ["name"],
                rows: [{ name: "Alice" }],
              };
      api.runQuery.mockResolvedValue(execution(result));
      await act(async () => {
        await hook.result.current.onRun();
      });
      expect(hook.result.current.run.result).toEqual(result);
      expect(hook.result.current.view).toBe(
        kind === "graph" ? "graph" : "query",
      );
      expect(hook.result.current.history).toEqual([initialSource]);
      if (kind === "graph") expect(hook.result.current.graph).toEqual(graph);
      if (kind === "describe") {
        expect(hook.result.current.detail).toEqual(detail);
        expect(hook.result.current.selectedId).toBe("0");
      }
    },
  );

  it("keeps history unique and limits it to the twelve most recent successful queries", async () => {
    const hook = await mountWorkspace();
    await connectWorkspace(hook);
    for (let index = 0; index < 14; index++) {
      act(() => hook.result.current.setQuery(`SELECT ${index}`));
      await compileDraft();
      await act(async () => {
        await hook.result.current.onRun();
      });
    }
    await act(async () => {
      await hook.result.current.onRun();
    });
    expect(hook.result.current.history).toHaveLength(12);
    expect(hook.result.current.history[0]).toBe("SELECT 13");
    expect(new Set(hook.result.current.history).size).toBe(12);
    expect(hook.result.current.history).not.toContain("SELECT 0");
  });

  it.each(["success", "failure"])(
    "ignores query %s after disconnect",
    async (outcome) => {
      const pending = deferred<QueryExecution>();
      const hook = await mountWorkspace();
      await connectWorkspace(hook);
      api.runQuery.mockReturnValue(pending.promise);
      let running!: Promise<void>;
      act(() => {
        running = hook.result.current.onRun();
      });
      expect(hook.result.current.run.running).toBe(true);
      act(() => hook.result.current.disconnect());
      await act(async () => {
        outcome === "success"
          ? pending.resolve(execution({ kind: "graph", graph }))
          : pending.reject(new BackendError("offline", { kind: "transport" }));
        await running;
      });
      expect(hook.result.current.status.kind).toBe("disconnected");
      expect(hook.result.current.run.result).toBeNull();
      expect(hook.result.current.run.error).toBeNull();
      expect(hook.result.current.graph).toBeNull();
    },
  );

  it("keeps the latest query when an earlier execution completes last", async () => {
    const old = deferred<QueryExecution>();
    const hook = await mountWorkspace();
    await connectWorkspace(hook);
    api.runQuery
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(execution({ kind: "count", value: 9 }));
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.onRun();
    });
    act(() => hook.result.current.setQuery("SELECT COUNT(*) FROM NODES"));
    await compileDraft();
    await act(async () => {
      await hook.result.current.onRun();
    });
    await act(async () => {
      old.resolve(execution({ kind: "count", value: 1 }));
      await first;
    });
    expect(hook.result.current.run.result).toEqual({ kind: "count", value: 9 });
  });

  it.each(["transport", "http", "invalidUrl", "result", "hql", "io"])(
    "classifies %s failures without adding failed queries to history",
    async (kind) => {
      const hook = await mountWorkspace();
      await connectWorkspace(hook);
      api.runQuery.mockRejectedValue(
        new BackendError("failed", { kind, hint: "try again" }),
      );
      await act(async () => {
        await hook.result.current.onRun();
      });
      expect(hook.result.current.run.error).toEqual({
        message: "failed",
        detail: "try again",
      });
      expect(hook.result.current.status.kind).toBe(
        ["hql", "io"].includes(kind) ? "connected" : "failed",
      );
      expect(hook.result.current.history).toEqual([]);
    },
  );

  it("shows executed wire only for the current source and connection revision", async () => {
    const hook = await mountWorkspace();
    await connectWorkspace(hook);
    await act(async () => {
      await hook.result.current.onRun();
    });
    expect(hook.result.current.executedWire).toBe(true);
    act(() => hook.result.current.setQuery("SHOW STATS"));
    expect(hook.result.current.executedWire).toBe(false);
    await compileDraft();
    expect(hook.result.current.wireCompiled?.summary).toBe("SHOW STATS");
  });
});
