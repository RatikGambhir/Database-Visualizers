import { act, cleanup, renderHook } from "@testing-library/react";
import { createElement, StrictMode, type PropsWithChildren } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import * as client from "../../src/client";
import { useWorkspace } from "../../src/app/useWorkspace";
import { compiled, connection, execution, schema, update } from "./fixtures";

vi.mock("../../src/client", async (original) => ({
  ...(await original<typeof import("../../src/client")>()),
  isDesktop: vi.fn(),
  getConnection: vi.fn(),
  compileQuery: vi.fn(),
  runQuery: vi.fn(),
  testConnection: vi.fn(),
  setConnection: vi.fn(),
  loadSchema: vi.fn(),
}));
export const api = vi.mocked(client);
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  let live = { ...connection };
  api.isDesktop.mockReturnValue(true);
  api.getConnection.mockResolvedValue(live);
  api.compileQuery.mockImplementation(async (source) =>
    compiled(source, live.revision),
  );
  api.runQuery.mockImplementation(async (source) =>
    execution({ kind: "count", value: 3 }, source, live.revision),
  );
  api.testConnection.mockResolvedValue({ durationMs: 7 });
  api.setConnection.mockImplementation(async (next) => {
    live = {
      ...live,
      ...next,
      databaseId: next.databaseId ?? null,
      revision: live.revision + 1,
    };
    return live;
  });
  api.loadSchema.mockResolvedValue({
    connectionRevision: 2,
    schema,
    durationMs: 8,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

export async function mountWorkspace() {
  const hook = renderHook(useWorkspace, {
    wrapper: ({ children }: PropsWithChildren) =>
      createElement(StrictMode, null, children),
  });
  await act(async () => {});
  return hook;
}
export async function compileDraft() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120);
  });
}
export async function connectWorkspace(
  hook: Awaited<ReturnType<typeof mountWorkspace>>,
) {
  await act(async () => {
    await hook.result.current.saveConnection(update);
  });
  await compileDraft();
}
