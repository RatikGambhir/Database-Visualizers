// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackendError } from "../src/client";
import {
  api,
  compileDraft,
  connectWorkspace,
  mountWorkspace,
} from "./support/workspace";
import { connection, deferred, schema, update } from "./support/fixtures";

describe("connection session", () => {
  it("loads saved settings once in Strict Mode without claiming a live connection", async () => {
    const hook = await mountWorkspace();
    expect(api.getConnection).toHaveBeenCalledTimes(1);
    expect(hook.result.current.connection).toEqual(connection);
    expect(hook.result.current.status.kind).toBe("disconnected");
    expect(api.testConnection).not.toHaveBeenCalled();
  });

  it("handles missing saved settings and a plain browser", async () => {
    api.getConnection.mockRejectedValue(new Error("unavailable"));
    api.isDesktop.mockReturnValue(false);
    const hook = await mountWorkspace();
    await compileDraft();
    expect(hook.result.current.connection).toBeNull();
    expect(hook.result.current.desktop).toBe(false);
    expect(api.compileQuery).not.toHaveBeenCalled();
  });

  it("probes before saving and refreshes schema after persistence", async () => {
    const hook = await mountWorkspace();
    await connectWorkspace(hook);
    const probeOrder = api.testConnection.mock.invocationCallOrder[0];
    const saveOrder = api.setConnection.mock.invocationCallOrder[0];
    const schemaOrder = api.loadSchema.mock.invocationCallOrder[0];
    expect(probeOrder).toBeLessThan(saveOrder);
    expect(saveOrder).toBeLessThan(schemaOrder);
    expect(hook.result.current.status).toEqual({
      kind: "connected",
      durationMs: 8,
    });
    expect(hook.result.current.connection?.revision).toBe(2);
    expect(hook.result.current.schema).toEqual(schema);
  });

  it("does not persist a failed probe and reports its diagnostic", async () => {
    api.testConnection.mockRejectedValue(
      new BackendError("unreachable", {
        kind: "transport",
        detail: "connection refused",
      }),
    );
    const hook = await mountWorkspace();
    await act(async () => {
      await expect(hook.result.current.saveConnection(update)).rejects.toThrow(
        "unreachable — connection refused",
      );
    });
    expect(api.setConnection).not.toHaveBeenCalled();
    expect(api.loadSchema).not.toHaveBeenCalled();
    expect(hook.result.current.connection).toEqual(connection);
    expect(hook.result.current.status.kind).toBe("failed");
  });

  it("retains saved settings after persistence fails", async () => {
    api.setConnection.mockRejectedValue(
      new BackendError("disk full", { kind: "io" }),
    );
    const hook = await mountWorkspace();
    await act(async () => {
      await expect(hook.result.current.saveConnection(update)).rejects.toThrow(
        "disk full",
      );
    });
    expect(hook.result.current.connection).toEqual(connection);
    expect(api.loadSchema).not.toHaveBeenCalled();
  });

  it("ignores a probe that completes after disconnect", async () => {
    const pending = deferred<{ durationMs: number }>();
    api.testConnection.mockReturnValue(pending.promise);
    const hook = await mountWorkspace();
    let saving!: Promise<void>;
    act(() => {
      saving = hook.result.current.saveConnection(update);
    });
    act(() => hook.result.current.disconnect());
    await act(async () => {
      pending.resolve({ durationMs: 1 });
      await saving;
    });
    expect(api.setConnection).not.toHaveBeenCalled();
    expect(hook.result.current.status.kind).toBe("disconnected");
  });

  it("keeps the newer connection when two probes finish out of order", async () => {
    const old = deferred<{ durationMs: number }>();
    api.testConnection
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ durationMs: 2 });
    const hook = await mountWorkspace();
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.saveConnection({
        ...update,
        url: "http://old",
      });
    });
    await act(async () => {
      await hook.result.current.saveConnection({
        ...update,
        url: "http://new",
      });
    });
    await act(async () => {
      old.resolve({ durationMs: 1 });
      await first;
    });
    expect(api.setConnection).toHaveBeenCalledTimes(1);
    expect(hook.result.current.connection?.url).toBe("http://new");
  });

  it("discards saved-setting startup results after the session changes", async () => {
    const pending = deferred<typeof connection>();
    api.getConnection.mockReturnValue(pending.promise);
    const hook = await mountWorkspace();
    await connectWorkspace(hook);
    await act(async () =>
      pending.resolve({ ...connection, url: "http://obsolete" }),
    );
    expect(hook.result.current.connection?.url).toBe(update.url);
    expect(hook.result.current.connection?.revision).toBe(2);
  });
});
