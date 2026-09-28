// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConnectionForm } from "../src/ui/connection/useConnectionForm";
import {
  buildLocalUrl,
  normalizeRemoteUrl,
  parseConnection,
} from "../src/ui/connection/form";
import { connection, deferred } from "./support/fixtures";

afterEach(cleanup);
function form(saved = connection) {
  const onTest = vi.fn().mockResolvedValue(12);
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  return {
    ...renderHook(() =>
      useConnectionForm({ connection: saved, onTest, onSave, onClose }),
    ),
    onTest,
    onSave,
    onClose,
  };
}
const event = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent;

describe("connection URL helpers", () => {
  it.each([
    [" localhost ", " 6969 ", "http://127.0.0.1:6969"],
    ["::1", "80", "http://[::1]:80"],
    ["[::1]", "80", "http://[::1]:80"],
    ["db.local", "443", "http://db.local:443"],
  ])("builds host %s port %s", (host, port, expected) =>
    expect(buildLocalUrl(host, port)).toBe(expected),
  );
  it.each([
    [" instance.example.com/ ", "https://instance.example.com"],
    ["http://server:6969/helix///", "http://server:6969/helix"],
  ])("normalizes remote URL %s", (raw, expected) =>
    expect(normalizeRemoteUrl(raw)).toBe(expected),
  );
  it.each([
    "http://localhost:6969",
    "http://127.0.0.1:6969",
    "http://[::1]:6969",
  ])("recognizes local connection %s", (url) =>
    expect(parseConnection({ ...connection, url }).mode).toBe("local"),
  );
  it.each([
    "https://localhost:6969",
    "http://localhost:6969/gateway",
    "http://localhost:6969/?db=1",
    "https://example.com",
  ])("retains remote connection %s", (url) =>
    expect(parseConnection({ ...connection, url })).toMatchObject({
      mode: "remote",
      remoteUrl: url,
    }),
  );
  it("falls back for missing or invalid saved URLs", () => {
    expect(parseConnection(null).port).toBe("6969");
    expect(parseConnection({ ...connection, url: "not a URL" }).mode).toBe(
      "local",
    );
  });
});

describe("draft validation and credentials", () => {
  it.each(["0", "65536", "1.5", "abc", "", "-1"])(
    "rejects invalid port %j before probing",
    async (port) => {
      const hook = form();
      act(() => hook.result.current.setPort(port));
      await act(async () => {
        await hook.result.current.test();
      });
      expect(hook.onTest).not.toHaveBeenCalled();
      expect(hook.result.current.feedback?.kind).toBe("error");
      expect(hook.result.current.busy).toBeNull();
    },
  );
  it.each(["1", "65535"])("accepts boundary port %s", async (port) => {
    const hook = form();
    act(() => hook.result.current.setPort(port));
    await act(async () => {
      await hook.result.current.test();
    });
    expect(hook.onTest).toHaveBeenCalledTimes(1);
  });
  it("requires a host or a remote URL for the selected mode", async () => {
    const hook = form();
    act(() => hook.result.current.setHost("  "));
    await act(async () => {
      await hook.result.current.test();
    });
    expect(hook.result.current.feedback?.message).toContain("Host");
    act(() => hook.result.current.setMode("remote"));
    await act(async () => {
      await hook.result.current.test();
    });
    expect(hook.result.current.feedback?.message).toContain("URL");
    expect(hook.onTest).not.toHaveBeenCalled();
  });
  it.each(["keep", "replace", "clear"])(
    "sends the correct tri-state API key for %s",
    async (action) => {
      const hook = form({ ...connection, hasApiKey: true });
      act(() => {
        if (action === "replace") hook.result.current.setApiKey("new-key");
        if (action === "clear") hook.result.current.setClearKey(true);
      });
      await act(async () => {
        await hook.result.current.test();
      });
      expect(hook.onTest.mock.calls[0][0].apiKey).toBe(
        action === "replace" ? "new-key" : action === "clear" ? "" : undefined,
      );
    },
  );
  it("selects database IDs only for Shared Cloud and preserves advanced settings", async () => {
    const hook = form();
    act(() => {
      hook.result.current.setDeployment("sharedCloud");
      hook.result.current.setDatabaseId(" db-a ");
      hook.result.current.setTimeoutMs(45000);
      hook.result.current.setWriterOnly(true);
    });
    await act(async () => {
      await hook.result.current.test();
    });
    expect(hook.onTest.mock.calls[0][0]).toMatchObject({
      databaseId: "db-a",
      timeoutMs: 45000,
      writerOnly: true,
    });
    act(() => hook.result.current.setDeployment("databaseCloud"));
    await act(async () => {
      await hook.result.current.test();
    });
    expect(hook.onTest.mock.calls[1][0].databaseId).toBeNull();
  });
  it("shows pending feedback and closes only after a successful save", async () => {
    const hook = form();
    const pending = deferred<void>();
    hook.onSave.mockReturnValue(pending.promise);
    let saving!: Promise<void>;
    act(() => {
      saving = hook.result.current.submit(event());
    });
    expect(hook.result.current.busy).toBe("connect");
    expect(hook.onClose).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve();
      await saving;
    });
    expect(hook.onClose).toHaveBeenCalledOnce();
    expect(hook.result.current.busy).toBeNull();
  });
  it("keeps the dialog open and resets busy state when saving fails", async () => {
    const hook = form();
    hook.onSave.mockRejectedValue(new Error("disk full"));
    await act(async () => {
      await hook.result.current.submit(event());
    });
    expect(hook.onClose).not.toHaveBeenCalled();
    expect(hook.result.current.feedback?.message).toBe("disk full");
    expect(hook.result.current.busy).toBeNull();
  });
});
