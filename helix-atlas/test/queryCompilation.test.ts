// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendError, compileQuery } from "../src/client";
import { useQueryCompilation } from "../src/app/useQueryCompilation";
import { compiled, deferred } from "./support/fixtures";

vi.mock("../src/client", async (original) => ({
  ...(await original<typeof import("../src/client")>()),
  compileQuery: vi.fn(),
}));
const compile = vi.mocked(compileQuery);

beforeEach(() => {
  vi.useFakeTimers();
  compile.mockReset();
  compile.mockResolvedValue(compiled());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(120);
  });

describe("editor compilation", () => {
  it("debounces typing and preserves current source offsets", async () => {
    const { result, rerender } = renderHook(
      ({ query }) => useQueryCompilation(true, query, 1),
      { initialProps: { query: "Q" } },
    );
    rerender({ query: "QU" });
    rerender({ query: "  QUERY LIMIT 300  " });
    await tick();
    expect(compile).toHaveBeenCalledExactlyOnceWith("  QUERY LIMIT 300  ", undefined);
    expect(result.current.compileState.compiled).toEqual(compiled());
  });

  it.each([
    [false, "QUERY"],
    [true, "  \n "],
  ])("does not compile desktop=%s source=%j", async (desktop, query) => {
    const { result } = renderHook(() => useQueryCompilation(desktop, query, 1));
    await tick();
    expect(compile).not.toHaveBeenCalled();
    expect(result.current.compileState.compiled).toBeNull();
  });

  it.each(["success", "failure"])(
    "ignores stale %s when a newer source wins",
    async (outcome) => {
      const old = deferred<ReturnType<typeof compiled>>();
      compile
        .mockReturnValueOnce(old.promise)
        .mockResolvedValue(compiled("new"));
      const { result, rerender } = renderHook(
        ({ query }) => useQueryCompilation(true, query, 1),
        { initialProps: { query: "old" } },
      );
      await tick();
      rerender({ query: "new" });
      await tick();
      await act(async () => {
        outcome === "success"
          ? old.resolve(compiled("old"))
          : old.reject(new Error("old failure"));
      });
      expect(result.current.compileState).toMatchObject({
        source: "new",
        compiled: compiled("new"),
        error: null,
      });
    },
  );

  it("recompiles an unchanged source after the connection revision changes", async () => {
    const { rerender } = renderHook(
      ({ revision }) => useQueryCompilation(true, "QUERY", revision),
      { initialProps: { revision: 1 } },
    );
    await tick();
    rerender({ revision: 2 });
    await tick();
    expect(compile).toHaveBeenCalledTimes(2);
  });

  it("preserves structured compiler spans and hints", async () => {
    const error = new BackendError("bad query", {
      kind: "hql",
      span: { start: 1, end: 2, line: 1, column: 2 },
      hint: "quote the property",
    });
    compile.mockRejectedValue(error);
    const { result } = renderHook(() => useQueryCompilation(true, "bad", 1));
    await tick();
    expect(result.current.compileState.error).toBe(error);
  });

  it("normalizes unexpected failures without leaving an old compiled query", async () => {
    compile.mockRejectedValue("compiler unavailable");
    const { result } = renderHook(() => useQueryCompilation(true, "bad", 1));
    await tick();
    expect(result.current.compileState.error?.message).toBe(
      "compiler unavailable",
    );
    expect(result.current.compileState.compiled).toBeNull();
  });

  it("cancels a queued debounce on unmount", async () => {
    const { unmount } = renderHook(() => useQueryCompilation(true, "QUERY", 1));
    unmount();
    await tick();
    expect(compile).not.toHaveBeenCalled();
  });

  it("reset invalidates a pending response even when the source and revision stay unchanged", async () => {
    const pending = deferred<ReturnType<typeof compiled>>();
    compile.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useQueryCompilation(true, "QUERY", 1));
    await tick();
    act(() => result.current.resetCompilation());
    await act(async () => pending.resolve(compiled("QUERY", 1)));
    expect(result.current.compileState).toEqual({
      source: "",
      compiled: null,
      error: null,
    });
  });
});
