import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Protocol, Deployment } from "../../client";
import { ToolbarIcon } from "./ToolbarIcon";
import type { ConnectionMode } from "./form";
import {
  useConnectionForm,
  type ConnectionFormOptions,
} from "./useConnectionForm";

export function ConnectionDialog({
  connection,
  connected,
  desktop,
  onClose,
  onSave,
  onTest,
  onDisconnect,
}: ConnectionFormOptions & {
  connected: boolean;
  desktop: boolean;
  onDisconnect: () => void;
}) {
  const {
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
  } = useConnectionForm({ connection, onClose, onSave, onTest });

  return (
    <DialogContent
      className="connection-dialog"
      showCloseButton={false}
      onEscapeKeyDown={(event) => {
        if (busy !== null) event.preventDefault();
      }}
      onPointerDownOutside={(event) => {
        if (busy !== null) event.preventDefault();
      }}
    >
      <form onSubmit={submit} aria-labelledby="connection-title">
        <DialogHeader className="dialog-header">
          <div>
            <DialogTitle id="connection-title">Connection</DialogTitle>
            <DialogDescription>
              Connect to HelixDB locally, on a remote server, or in the cloud.
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="icon-button"
            onClick={onClose}
            disabled={busy !== null}
            aria-label="Close"
          >
            ×
          </Button>
        </DialogHeader>

        <div className="mode-picker" role="group" aria-label="Connection type">
          <ModeButton
            mode="local"
            active={mode}
            onSelect={setMode}
            title="Local"
            detail="Host and port"
          />
          <ModeButton
            mode="remote"
            active={mode}
            onSelect={setMode}
            title="Remote / Cloud"
            detail="URL and optional API key"
          />
        </div>

        <div className="dialog-fields">
          <Label className="field-label">
            <span>Read protocol</span>
            <select
              value={protocol}
              onChange={(event) => setProtocol(event.target.value as Protocol)}
            >
              <option value="v2">v2 — operation trees</option>
              <option value="legacyV1">Legacy v1 — flat reads</option>
            </select>
          </Label>
          <Label className="field-label">
            <span>Deployment</span>
            <select
              value={deployment}
              onChange={(event) =>
                setDeployment(event.target.value as Deployment)
              }
            >
              <option value="local">Local / remote server</option>
              <option value="databaseCloud">
                Cloud — database-specific gateway
              </option>
              <option value="sharedCloud">Cloud — shared gateway</option>
            </select>
          </Label>
          {deployment === "sharedCloud" ? (
            <Label className="field-label">
              <span>Database ID</span>
              <Input
                value={databaseId}
                onChange={(event) => setDatabaseId(event.target.value)}
                placeholder="Database ID from the Cloud dashboard"
              />
            </Label>
          ) : null}
          {mode === "local" ? (
            <>
              <div className="field-row">
                <Label className="field-label grow">
                  <span>Host</span>
                  <Input
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    placeholder="127.0.0.1"
                  />
                </Label>
                <Label className="field-label port-field">
                  <span>Host port</span>
                  <Input
                    value={port}
                    inputMode="numeric"
                    onChange={(event) => setPort(event.target.value)}
                    placeholder="6969"
                  />
                </Label>
              </div>
              <p className="port-hint">
                For a Docker mapping such as <code>6969:8080</code>, enter the
                left-side host port: <code>6969</code>.
              </p>
            </>
          ) : (
            <Label className="field-label">
              <span>Remote server URL</span>
              <Input
                value={remoteUrl}
                onChange={(event) => setRemoteUrl(event.target.value)}
                placeholder="https://your-instance.example.com"
              />
            </Label>
          )}

          <Label className="field-label">
            <span>
              API key <small>(optional)</small>
            </span>
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                connection?.hasApiKey
                  ? "•••••••• (saved)"
                  : "Only if required by the server"
              }
              disabled={clearKey}
            />
          </Label>
          {connection?.hasApiKey ? (
            <Label className="check-field">
              <Checkbox
                checked={clearKey}
                onCheckedChange={(checked) => setClearKey(checked === true)}
              />
              Remove the saved API key
            </Label>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            className="advanced-toggle"
            onClick={() => setAdvanced((value) => !value)}
            aria-expanded={advanced}
          >
            <span aria-hidden="true">{advanced ? "⌄" : "›"}</span> Advanced
            options
          </Button>

          {advanced ? (
            <div className="advanced-fields">
              <Label className="field-label">
                <span>Request timeout (ms)</span>
                <Input
                  type="number"
                  min={1000}
                  max={600000}
                  step={1000}
                  value={timeout}
                  onChange={(event) => setTimeoutMs(Number(event.target.value))}
                />
              </Label>
              <Label className="check-field">
                <Checkbox
                  checked={writerOnly}
                  onCheckedChange={(checked) => setWriterOnly(checked === true)}
                />
                Require a writer node
              </Label>
            </div>
          ) : null}

          {!desktop ? (
            <p className="browser-note">
              Connection and query commands require the Rust process. Launch the
              functional app with <code>npm run app</code>.
            </p>
          ) : null}

          {feedback ? (
            <div
              className={`connection-feedback ${feedback.kind}`}
              role="status"
            >
              {feedback.message}
            </div>
          ) : null}
        </div>

        <footer className="dialog-actions">
          {connected ? (
            <Button
              variant="destructive"
              className="danger-button"
              onClick={onDisconnect}
              disabled={busy !== null}
            >
              Disconnect
            </Button>
          ) : (
            <span />
          )}
          <div>
            <Button
              variant="outline"
              onClick={test}
              disabled={busy !== null || !desktop}
            >
              {busy === "test" ? "Testing…" : "Test connection"}
            </Button>
            <Button
              type="submit"
              variant="default"
              className="primary"
              disabled={busy !== null || !desktop}
            >
              {busy === "connect"
                ? "Connecting…"
                : connected
                  ? "Reconnect"
                  : "Connect"}
            </Button>
          </div>
        </footer>
      </form>
    </DialogContent>
  );
}

function ModeButton({
  mode,
  active,
  onSelect,
  title,
  detail,
}: {
  mode: ConnectionMode;
  active: ConnectionMode;
  onSelect: (mode: ConnectionMode) => void;
  title: string;
  detail: string;
}) {
  const selected = active === mode;
  return (
    <Button
      variant="outline"
      aria-pressed={selected}
      className={selected ? "mode-card active h-auto" : "mode-card h-auto"}
      onClick={() => onSelect(mode)}
    >
      <ToolbarIcon name={mode === "local" ? "desktop" : "cloud"} />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <i aria-hidden="true">{selected ? "✓" : ""}</i>
    </Button>
  );
}
