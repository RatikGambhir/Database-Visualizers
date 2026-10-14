import { useCallback, useState } from "react";
import { ConnectionBar } from "./ui/ConnectionBar";
import { SchemaView } from "./ui/SchemaView";
import { SplashScreen } from "./ui/SplashScreen";
import { GraphWorkspace } from "./app/GraphWorkspace";
import { QueryWorkspace } from "./app/QueryWorkspace";
import { useTheme } from "./app/useTheme";
import { useWorkspace } from "./app/useWorkspace";

export type { AppView } from "./app/types";

/** Application shell; session actions and workspace rendering have separate owners. */
export function App() {
  const workspace = useWorkspace();
  const [theme, setTheme] = useTheme();
  const [showSplash, setShowSplash] = useState(true);
  const completeSplash = useCallback(() => setShowSplash(false), []);
  const {
    connection,
    status,
    desktop,
    view,
    setView,
    connectionOpenRequest,
    saveConnection,
    testCandidate,
    disconnect,
    schema,
    schemaError,
    schemaLoading,
    refreshSchema,
    setConnectionOpenRequest,
    setQuery,
  } = workspace;

  if (showSplash) {
    return <SplashScreen minDuration={2_000} onComplete={completeSplash} />;
  }

  return (
    <div className="app">
      <ConnectionBar
        connection={connection}
        status={status}
        desktop={desktop}
        theme={theme}
        activeView={view}
        openRequest={connectionOpenRequest}
        onSelectView={setView}
        onToggleTheme={() =>
          setTheme((value) => (value === "dark" ? "light" : "dark"))
        }
        onSave={saveConnection}
        onTest={testCandidate}
        onDisconnect={disconnect}
      />

      <main className="app-main">
        {view === "query" ? (
          <QueryWorkspace workspace={workspace} theme={theme} />
        ) : view === "schema" ? (
          <SchemaView
            schema={schema}
            error={schemaError}
            loading={schemaLoading}
            connected={status.kind === "connected"}
            onRefresh={refreshSchema}
            onConnect={() => setConnectionOpenRequest((value) => value + 1)}
            onUseQuery={(nextQuery) => {
              setQuery(nextQuery);
              setView("query");
            }}
          />
        ) : (
          <GraphWorkspace workspace={workspace} theme={theme} />
        )}
      </main>
      <footer className="workspace-status">
        <span><span className={`status-dot status-${status.kind}`} />{desktop ? "HelixDB workspace" : "Browser preview · connect in the desktop app"}</span>
        <span>HELIXSQL <span className="status-separator">/</span> GRAPH WORKSPACE</span>
      </footer>
    </div>
  );
}
