// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "../src/app/useTheme";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("theme preference", () => {
  it.each(["light", "dark"])(
    "restores saved %s ahead of system preference",
    (theme) => {
      localStorage.setItem("helix-visualizer.theme", theme);
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches: theme !== "light" })),
      );
      const { result } = renderHook(useTheme);
      expect(result.current[0]).toBe(theme);
      expect(document.documentElement.dataset.theme).toBe(theme);
    },
  );
  it.each([true, false])(
    "uses system preference when storage is invalid (light: %s)",
    (matches) => {
      localStorage.setItem("helix-visualizer.theme", "invalid");
      vi.stubGlobal(
        "matchMedia",
        vi.fn(() => ({ matches })),
      );
      const { result } = renderHook(useTheme);
      expect(result.current[0]).toBe(matches ? "light" : "dark");
    },
  );
  it("defaults to dark without matchMedia and persists changes", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(useTheme);
    expect(result.current[0]).toBe("dark");
    act(() => result.current[1]("light"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("helix-visualizer.theme")).toBe("light");
  });
});
