// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionBar } from "../src/ui/ConnectionBar";
import type { ConnectionStatus } from "../src/app/types";
import { connection, deferred } from "./support/fixtures";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function props() {
  return {
    connection,
    status: { kind: "connected", durationMs: 7 } as ConnectionStatus,
    desktop: true,
    theme: "dark" as const,
    activeView: "query" as const,
    openRequest: 0,
    onSelectView: vi.fn(),
    onToggleTheme: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onTest: vi.fn().mockResolvedValue(12),
    onDisconnect: vi.fn(),
  };
}

describe("connection settings dialog", () => {
  it("builds a Remote Shared Cloud candidate from visible controls", async () => {
    const options = props();
    render(<ConnectionBar {...options} />);
    fireEvent.click(screen.getByRole("button", { name: "Connection" }));
    fireEvent.click(screen.getByRole("button", { name: /Remote \/ Cloud/ }));
    fireEvent.change(screen.getByLabelText("Remote server URL"), {
      target: { value: " gateway.example.com/helix/ " },
    });
    fireEvent.change(screen.getByLabelText("Deployment"), {
      target: { value: "sharedCloud" },
    });
    fireEvent.change(screen.getByLabelText("Database ID"), {
      target: { value: " db-a " },
    });
    fireEvent.change(screen.getByLabelText(/API key/), {
      target: { value: "new-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Advanced options" }));
    fireEvent.change(screen.getByLabelText("Request timeout (ms)"), {
      target: { value: "45000" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Require a writer node" }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    });
    expect(options.onTest).toHaveBeenCalledWith({
      url: "https://gateway.example.com/helix",
      protocol: "v2",
      deployment: "sharedCloud",
      databaseId: "db-a",
      apiKey: "new-key",
      timeoutMs: 45000,
      writerOnly: true,
    });
    expect(
      screen.getByText("Read count probe succeeded in 12 ms."),
    ).toBeTruthy();
    expect(options.onSave).not.toHaveBeenCalled();
  });
  it("clears a saved credential explicitly and reconnects with the chosen legacy protocol", async () => {
    const options = props();
    options.connection = { ...connection, hasApiKey: true };
    render(<ConnectionBar {...options} openRequest={1} />);
    const key = screen.getByLabelText(/^API key/) as HTMLInputElement;
    expect(key.value).toBe("");
    expect(key.placeholder).toContain("saved");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Remove the saved API key" }),
    );
    expect(key.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Read protocol"), {
      target: { value: "legacyV1" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    });
    expect(options.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "", protocol: "legacyV1" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("retains editable fields and displays errors after a failed probe", async () => {
    const options = props();
    options.onTest.mockRejectedValue(new Error("unauthorized"));
    render(<ConnectionBar {...options} openRequest={1} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    });
    expect(screen.getByText("unauthorized")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Test connection",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("prevents closing or submitting a second request while a save is pending", async () => {
    const options = props();
    const pending = deferred<void>();
    options.onSave.mockReturnValue(pending.promise);
    render(<ConnectionBar {...options} openRequest={1} />);
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(
      (screen.getByRole("button", { name: "Close" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Test connection",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Disconnect" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => {
      pending.resolve();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(options.onSave).toHaveBeenCalledOnce();
  });
  it("opens a fresh draft after cancellation and responds to another open request", () => {
    const options = props();
    const view = render(<ConnectionBar {...options} openRequest={1} />);
    fireEvent.change(screen.getByLabelText("Host"), {
      target: { value: "unsaved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    view.rerender(<ConnectionBar {...options} openRequest={2} />);
    expect((screen.getByLabelText("Host") as HTMLInputElement).value).toBe(
      "127.0.0.1",
    );
    expect(options.onSave).not.toHaveBeenCalled();
  });
  it.each(["checking", "failed", "disconnected"] as const)(
    "announces the %s status",
    (kind) => {
      const status: ConnectionStatus =
        kind === "failed" ? { kind, message: "offline" } : { kind };
      render(<ConnectionBar {...props()} status={status} />);
      expect(screen.getByRole("status").textContent).toBe(
        kind === "checking"
          ? "Connecting…"
          : kind === "failed"
            ? "Connection failed"
            : "Not connected",
      );
    },
  );
});
