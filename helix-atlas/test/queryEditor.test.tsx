// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendError } from "../src/client";
import { QueryEditor } from "../src/ui/QueryEditor";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const props = () => ({
  value: "SELECT *\nFROM NODES",
  onChange: vi.fn(),
  onRun: vi.fn(),
  running: false,
  available: true,
  error: null as BackendError | null,
});

describe("query editor interactions", () => {
  it.each(["ctrlKey", "metaKey"])(
    "runs on %s + Enter while preserving ordinary Enter",
    (key) => {
      const options = props();
      render(<QueryEditor {...options} />);
      const textarea = screen.getByRole("textbox", { name: "HelixSQL query" });
      fireEvent.keyDown(textarea, { key: "Enter" });
      expect(options.onRun).not.toHaveBeenCalled();
      fireEvent.keyDown(textarea, { key: "Enter", [key]: true });
      expect(options.onRun).toHaveBeenCalledOnce();
    },
  );
  it.each(["unavailable", "running", "error"])(
    "disabled Run cannot be bypassed by a shortcut when %s",
    (state) => {
      const options = props();
      if (state === "unavailable") options.available = false;
      if (state === "running") options.running = true;
      if (state === "error") options.error = new BackendError("invalid query");
      render(<QueryEditor {...options} />);
      expect(
        (screen.getByRole("button", { name: /Run/ }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      fireEvent.keyDown(screen.getByRole("textbox"), {
        key: "Enter",
        ctrlKey: true,
      });
      expect(options.onRun).not.toHaveBeenCalled();
    },
  );
  it("inserts spaces in place of the selected text on Tab", () => {
    const options = props();
    render(<QueryEditor {...options} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 6);
    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(options.onChange).toHaveBeenCalledWith("   *\nFROM NODES");
  });
  it("announces compiler diagnostics and jumps to the offending source span", () => {
    const options = props();
    options.error = new BackendError("invalid source", {
      span: { start: 10, end: 14, line: 2, column: 1 },
      hint: "use NODES",
    });
    render(<QueryEditor {...options} />);
    expect(screen.getByRole("alert").textContent).toContain("use NODES");
    fireEvent.click(screen.getByRole("button", { name: "line 2:1" }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.selectionStart).toBe(10);
    expect(textarea.selectionEnd).toBe(14);
    expect(textarea.getAttribute("aria-invalid")).toBe("true");
  });
});
