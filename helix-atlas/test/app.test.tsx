// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Register the IPC test double before loading the application modules.
import { api, compileDraft } from "./support/workspace";
import { App } from "../src/App";
import { BackendError } from "../src/client";
import { connection, execution, initialSource } from "./support/fixtures";
import { populatedSchema } from "./support/schema";

// Animation and canvas geometry require a real webview. Keep the session,
// navigation, dialog, editor, schema, tables and inspector real in these tests.
vi.mock("../src/ui/SplashScreen", () => ({
  SplashScreen: ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete}>Enter workspace</button>
  ),
}));
vi.mock("../src/graph/GraphCanvas", () => ({
  GraphCanvas: () => <div>Graph canvas</div>,
}));
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function start() {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Enter workspace" }));
  await act(async () => {});
  await compileDraft();
}
async function connect() {
  fireEvent.click(screen.getByRole("button", { name: "Connection" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  });
  await compileDraft();
}

describe("application workflows", () => {
  it("navigates browser-only workspaces and explains unavailable connection commands", async () => {
    api.isDesktop.mockReturnValue(false);
    api.getConnection.mockRejectedValue(
      new Error("desktop bridge unavailable"),
    );
    await start();
    expect(screen.getByText("Start with a connection.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Run query" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Schema" }));
    expect(screen.getByText("Connect to inspect your schema")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(screen.getByText("Connect to explore your graph")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connect Now" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByText(/Connection and query commands require/),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Connect",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(api.compileQuery).not.toHaveBeenCalled();
    expect(api.testConnection).not.toHaveBeenCalled();
  });
  it("changes and persists theme from the toolbar", async () => {
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Use dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("helix-visualizer.theme")).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Use light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("connects, browses a schema label, executes it and displays the executed wire", async () => {
    api.loadSchema.mockResolvedValue({
      connectionRevision: 2,
      schema: populatedSchema,
      durationMs: 8,
    });
    await start();
    await connect();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.testConnection).toHaveBeenCalledOnce();
    expect(api.setConnection).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Schema" }));
    fireEvent.click(screen.getByRole("button", { name: /User/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open in Query" }));
    const source = populatedSchema.nodeLabels[0].browseQuery;
    expect(
      (
        screen.getByRole("textbox", {
          name: "HelixSQL query",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe(source);
    await compileDraft();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run query" }));
    });
    expect(api.runQuery).toHaveBeenCalledWith(source);
    expect(screen.getByText("matching entities")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Wire format" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(screen.getByText(/Executed read at/)).toBeTruthy();
    expect(screen.getByText(`POST ${connection.endpoint}`)).toBeTruthy();
  });
  it("shows compiler diagnostics and clears them after correcting a query", async () => {
    await start();
    await connect();
    api.compileQuery.mockRejectedValueOnce(
      new BackendError("Unknown clause", {
        span: { start: 0, end: 3, line: 1, column: 1 },
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "HelixSQL query" }), {
      target: { value: "BAD" },
    });
    await compileDraft();
    expect(screen.getByRole("alert").textContent).toContain("Unknown clause");
    expect(
      (screen.getByRole("button", { name: "Run query" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "HelixSQL query" }), {
      target: { value: initialSource },
    });
    await compileDraft();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Run query" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });
  it("renders transport diagnostics and resets session output on disconnect", async () => {
    await start();
    await connect();
    api.runQuery.mockRejectedValueOnce(
      new BackendError("Server failed", {
        kind: "http",
        status: 503,
        detail: "upstream unavailable",
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run query" }));
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "upstream unavailable",
    );
    expect(screen.getByText("Connection failed")).toBeTruthy();
    // A new successful probe and save restores the connected session.
    await connect();
    api.runQuery.mockResolvedValueOnce(execution());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run query" }));
    });
    expect(screen.getByText("matching entities")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Connection" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("matching entities")).toBeNull();
    expect(screen.getByText("Not connected")).toBeTruthy();
  });
});
