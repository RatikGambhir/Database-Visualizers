import type { ConnectionView } from "../../client";

export type ConnectionMode = "local" | "remote";

export function parseConnection(connection: ConnectionView | null) {
  const fallback = {
    mode: "local" as const,
    host: "127.0.0.1",
    port: "6969",
    remoteUrl: "",
  };
  if (!connection) return fallback;
  const raw = connection.url.replace(" (via the Vite dev proxy)", "");
  try {
    const url = new URL(raw);
    const isLocal =
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) &&
      url.protocol === "http:" &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash;
    return {
      mode: (isLocal ? "local" : "remote") as ConnectionMode,
      host: isLocal
        ? url.hostname === "localhost"
          ? "127.0.0.1"
          : url.hostname
        : "127.0.0.1",
      port: isLocal ? url.port || "6969" : "6969",
      remoteUrl: isLocal ? "" : raw,
    };
  } catch {
    return fallback;
  }
}

export function buildLocalUrl(host: string, port: string): string {
  const normalizedHost =
    host.trim().toLowerCase() === "localhost" ? "127.0.0.1" : host.trim();
  const urlHost =
    normalizedHost.includes(":") && !normalizedHost.startsWith("[")
      ? `[${normalizedHost}]`
      : normalizedHost;
  return `http://${urlHost}:${port.trim()}`;
}

export function normalizeRemoteUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.includes("://") ? trimmed : `https://${trimmed}`;
}
