import { ArrowUpRight, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Theme } from "../graph/palette";
import { ParameterEditor } from "../ui/ParameterEditor";
import { QueryEditor } from "../ui/QueryEditor";
import { ResultsPanel } from "../ui/ResultsPanel";
import { Sidebar } from "../ui/Sidebar";
import { InspectorPane } from "./InspectorPane";
import type { OutputTab } from "./types";
import type { Workspace } from "./useWorkspace";

type Props = {
  theme: Theme;
  workspace: Pick<
    Workspace,
    | "schema"
    | "schemaError"
    | "schemaLoading"
    | "history"
    | "refreshSchema"
    | "setQuery"
    | "query"
    | "parameterRows"
    | "setParameterRows"
    | "onRun"
    | "run"
    | "mutationRefreshError"
    | "compileState"
    | "desktop"
    | "outputTab"
    | "setOutputTab"
    | "status"
    | "inspect"
    | "wireCompiled"
    | "executedWire"
    | "detail"
    | "detailLoading"
    | "detailError"
    | "expandNode"
    | "setConnectionOpenRequest"
  >;
};

export function QueryWorkspace({ workspace, theme }: Props) {
  const {
    schema,
    schemaError,
    schemaLoading,
    history,
    refreshSchema,
    setQuery,
    query,
    onRun,
    run,
    compileState,
    desktop,
    outputTab,
    setOutputTab,
    status,
    inspect,
    wireCompiled,
    executedWire,
    detail,
    detailLoading,
    detailError,
    expandNode,
  } = workspace;
  return (
    <div className="app-body query-view">
      <Sidebar
        schema={schema}
        schemaError={schemaError}
        refreshing={schemaLoading}
        history={history}
        onRefreshSchema={refreshSchema}
        onUseQuery={setQuery}
      />

      <section className="workspace">
        <QueryEditor
          value={query}
          onChange={setQuery}
          onRun={onRun}
          running={run.running}
          error={compileState.error}
          available={desktop && !!compileState.compiled && compileState.source === query}
          compiled={compileState.source === query ? compileState.compiled : null}
        />

        <ParameterEditor rows={workspace.parameterRows} onChange={workspace.setParameterRows} />

        <Tabs
          className="output"
          value={outputTab}
          onValueChange={(value) => setOutputTab(value as OutputTab)}
        >
          <TabsList className="tabs">
            <span className="output-label">OUTPUT</span>
            <TabsTrigger value="results" className="tab">
              Results
            </TabsTrigger>
            <TabsTrigger
              value="wire"
              className="tab"
              disabled={!compileState.compiled}
            >
              Wire format
            </TabsTrigger>

            <span className="tab-status">
              {run.running && "running…"}
              {!run.running &&
                run.durationMs !== null &&
                `${run.durationMs} ms`}
              {!run.running && run.compiled && ` · ${run.compiled.summary}`}
            </span>
          </TabsList>

          <TabsContent value="results" className="tab-body">
            {workspace.mutationRefreshError && <p role="status" className="panel-error">Mutation committed. {workspace.mutationRefreshError}</p>}
            {run.error && (
              <div className="panel-error" role="alert">
                <strong>{run.error.message}</strong>
                {run.error.detail && <pre>{run.error.detail}</pre>}
              </div>
            )}

            {!run.error &&
              (run.result ? (
                <ResultsPanel
                  result={run.result}
                  theme={theme}
                  onInspect={inspect}
                />
              ) : (
                <EmptyQueryState connected={status.kind === "connected"} onConnect={() => workspace.setConnectionOpenRequest((value) => value + 1)} />
              ))}
          </TabsContent>

          <TabsContent value="wire" className="tab-body">
            {run.error && (
              <div className="panel-error" role="alert">
                <strong>{run.error.message}</strong>
                {run.error.detail && <pre>{run.error.detail}</pre>}
              </div>
            )}
            {wireCompiled && (
              <div className="wire-view">
                <p className="hint-text">
                  {wireCompiled.mutation ? (executedWire ? "Executed mutation at" : "Mutation preview for") : executedWire ? "Executed read at" : "Read preview for"}{" "}
                  <code>POST {wireCompiled.endpoint}</code> ·{" "}
                  {wireCompiled.protocol === "legacyV1" ? "legacy v1" : "v2"}.
                </p>
                <pre>{wireCompiled.transportJson || JSON.stringify(wireCompiled.mutation, null, 2)}</pre>
                {wireCompiled.mutation && <details><summary>Ordered mutation plan</summary><pre>{JSON.stringify(wireCompiled.mutation, null, 2)}</pre></details>}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>

      <InspectorPane
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onInspect={inspect}
        onFocusInGraph={expandNode}
      />
    </div>
  );
}

function EmptyQueryState({ connected, onConnect }: { connected: boolean; onConnect: () => void }) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        {connected ? <ArrowUpRight size={22} /> : <Plug size={22} />}
      </span>
      <span className="eyebrow">YOUR WORKSPACE</span>
      <h2>
        {connected
          ? "A question is a starting point."
          : "Start with a connection."}
      </h2>
      <p>
        {connected
          ? "Run the query above to reveal your data. Try a starting point from the left rail if you need one."
          : "Connect to a local or remote HelixDB instance, then explore its shape with a query."}
      </p>
      {!connected && <Button onClick={onConnect}>Configure connection <ArrowUpRight size={14} /></Button>}
    </div>
  );
}
