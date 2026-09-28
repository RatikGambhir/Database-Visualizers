import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Compass, LockKeyhole } from "lucide-react";
import type { AppView } from "../app/types";
import type { ConnectionUpdate, ConnectionView } from "../client";
import { ConnectionDialog } from "./connection/ConnectionDialog";
import { ToolbarIcon } from "./connection/ToolbarIcon";

import type { ConnectionStatus } from "../app/types";
export type { ConnectionStatus } from "../app/types";

interface Props {
  connection: ConnectionView | null;
  status: ConnectionStatus;
  desktop: boolean;
  theme: "light" | "dark";
  activeView: AppView;
  openRequest: number;
  onSelectView: (view: AppView) => void;
  onToggleTheme: () => void;
  onSave: (update: ConnectionUpdate) => Promise<void>;
  onTest: (update: ConnectionUpdate) => Promise<number>;
  onDisconnect: () => void;
}

const NAV_ITEMS: Array<{
  id: AppView;
  label: string;
  icon: "query" | "schema" | "graph";
}> = [
  { id: "query", label: "Query", icon: "query" },
  { id: "schema", label: "Schema", icon: "schema" },
  { id: "graph", label: "Graph", icon: "graph" },
];

export function ConnectionBar({
  connection,
  status,
  desktop,
  theme,
  activeView,
  openRequest,
  onSelectView,
  onToggleTheme,
  onSave,
  onTest,
  onDisconnect,
}: Props) {
  const [open, setOpen] = useState(false);
  const connected = status.kind === "connected";

  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <header className="app-header">
        <div className="title-bar" data-tauri-drag-region>
          <div className="title-brand">
            <span className="brand-mark" aria-hidden="true"><Compass size={22} strokeWidth={1.5} /></span>
            <span className="brand-wordmark">
              Helix<span className="brand-wordmark-light"> Atlas</span>
            </span>
          </div>
          <span className="title-context">/ <span>{activeView === "graph" ? "Graph explorer" : activeView === "schema" ? "Schema catalog" : "Query workspace"}</span></span>
        </div>

        <div className="top-toolbar">
          <nav className="top-nav" aria-label="Main views">
            {NAV_ITEMS.map((item) => (
              <Button
                variant="ghost"
                key={item.id}
                className={
                  activeView === item.id
                    ? `toolbar-item nav-${item.id} active`
                    : `toolbar-item nav-${item.id}`
                }
                aria-current={activeView === item.id ? "page" : undefined}
                onClick={() => onSelectView(item.id)}
              >
                <ToolbarIcon name={item.icon} />
                <span>{item.label}</span>
              </Button>
            ))}
          </nav>

          <div className="toolbar-spacer" />

          <div
            className={`connection-summary status-${status.kind}`}
            role="status"
          >
            <span className="status-dot" aria-hidden="true" />
            <span>{describeStatus(status, connection)}</span>
          </div>

          <span className="read-only-label"><LockKeyhole size={12} /> Read only</span>

          <Button
            variant="ghost"
            className={
              connected
                ? "toolbar-item connection-item connected"
                : "toolbar-item connection-item"
            }
            onClick={() => setOpen(true)}
            title={
              connected
                ? `Connected to ${connection?.url ?? "HelixDB"}`
                : "Configure a connection"
            }
          >
            <ToolbarIcon name="connection" connected={connected} />
            <span>Connection</span>
            <i
              className={`toolbar-status status-${status.kind}`}
              aria-hidden="true"
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="theme-button"
            onClick={onToggleTheme}
            title={theme === "dark" ? "Use light theme" : "Use dark theme"}
            aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
          >
            <ToolbarIcon name={theme === "dark" ? "sun" : "moon"} />
          </Button>
        </div>
      </header>

      {open ? (
        <ConnectionDialog
          connection={connection}
          connected={connected}
          desktop={desktop}
          onClose={() => setOpen(false)}
          onSave={onSave}
          onTest={onTest}
          onDisconnect={() => {
            onDisconnect();
            setOpen(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function describeStatus(
  status: ConnectionStatus,
  connection: ConnectionView | null,
): string {
  switch (status.kind) {
    case "disconnected":
      return "Not connected";
    case "checking":
      return "Connecting…";
    case "connected":
      return `${shortHost(connection?.url)} · ${connection?.protocol === "legacyV1" ? "legacy v1" : "v2"} · ${status.durationMs} ms`;
    case "failed":
      return "Connection failed";
  }
}

function shortHost(url: string | undefined): string {
  if (!url) return "Connected";
  try {
    return new URL(url.replace(" (via the Vite dev proxy)", "")).host;
  } catch {
    return url;
  }
}
