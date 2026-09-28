import { useMemo, useState } from "react";
import type {
  ConnectionUpdate,
  ConnectionView,
  Protocol,
  Deployment,
} from "../../client";
import {
  parseConnection,
  buildLocalUrl,
  normalizeRemoteUrl,
  type ConnectionMode,
} from "./form";

export interface ConnectionFormOptions {
  connection: ConnectionView | null;
  onClose: () => void;
  onSave: (update: ConnectionUpdate) => Promise<void>;
  onTest: (update: ConnectionUpdate) => Promise<number>;
}

/** Draft settings, validation, and probe/save feedback for one dialog instance. */
export function useConnectionForm({
  connection,
  onClose,
  onSave,
  onTest,
}: ConnectionFormOptions) {
  const initial = useMemo(() => parseConnection(connection), [connection]);
  const [mode, setMode] = useState<ConnectionMode>(initial.mode);
  const [protocol, setProtocol] = useState<Protocol>(
    connection?.protocol ?? "v2",
  );
  const [deployment, setDeployment] = useState<Deployment>(
    connection?.deployment ?? "local",
  );
  const [databaseId, setDatabaseId] = useState(connection?.databaseId ?? "");
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(initial.port);
  const [remoteUrl, setRemoteUrl] = useState(initial.remoteUrl);
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [timeout, setTimeoutMs] = useState(connection?.timeoutMs ?? 30_000);
  const [writerOnly, setWriterOnly] = useState(connection?.writerOnly ?? false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState<"test" | "connect" | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const candidate = (): ConnectionUpdate => ({
    url:
      mode === "local"
        ? buildLocalUrl(host, port)
        : normalizeRemoteUrl(remoteUrl),
    apiKey: clearKey ? "" : apiKey.length > 0 ? apiKey : undefined,
    protocol,
    deployment,
    databaseId: deployment === "sharedCloud" ? databaseId.trim() : null,
    timeoutMs: timeout,
    writerOnly,
  });

  const validate = () => {
    if (mode === "local" && !host.trim())
      throw new Error("Host address is required.");
    const portNumber = Number(port);
    if (
      mode === "local" &&
      (!/^\d+$/.test(port.trim()) || portNumber < 1 || portNumber > 65_535)
    ) {
      throw new Error("Enter a port number from 1 to 65535.");
    }
    if (mode === "remote" && !remoteUrl.trim())
      throw new Error("Remote server URL is required.");
  };

  const test = async () => {
    setBusy("test");
    setFeedback(null);
    try {
      validate();
      const durationMs = await onTest(candidate());
      setFeedback({
        kind: "success",
        message: `Read count probe succeeded in ${durationMs} ms.`,
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("connect");
    setFeedback(null);
    try {
      validate();
      await onSave(candidate());
      onClose();
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(null);
    }
  };

  return {
    mode,
    setMode,
    protocol,
    setProtocol,
    deployment,
    setDeployment,
    databaseId,
    setDatabaseId,
    host,
    setHost,
    port,
    setPort,
    remoteUrl,
    setRemoteUrl,
    apiKey,
    setApiKey,
    clearKey,
    setClearKey,
    timeout,
    setTimeoutMs,
    writerOnly,
    setWriterOnly,
    advanced,
    setAdvanced,
    busy,
    feedback,
    test,
    submit,
  };
}
