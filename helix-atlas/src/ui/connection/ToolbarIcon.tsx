import { Cloud, Database, Monitor, Moon, Network, Plug, PlugZap, Sun, TerminalSquare } from "lucide-react";

const icons = { connection: Plug, query: TerminalSquare, schema: Database, graph: Network, sun: Sun, moon: Moon, desktop: Monitor, cloud: Cloud };
export function ToolbarIcon({ name, connected = false }: { name: keyof typeof icons; connected?: boolean }) {
  const Icon = name === "connection" && connected ? PlugZap : icons[name];
  return <Icon size={20} strokeWidth={1.6} aria-hidden="true" />;
}
