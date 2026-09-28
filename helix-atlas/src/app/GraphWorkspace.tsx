import { lazy, Suspense } from "react";
import { Network, RefreshCw, TerminalSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Theme } from "../graph/palette";
import type { GraphData } from "../results";
import { GraphWelcome } from "../ui/GraphWelcome";
import { InspectorPane } from "./InspectorPane";
import type { Workspace } from "./useWorkspace";

const GraphCanvas = lazy(() =>
  import("../graph/GraphCanvas").then((module) => ({
    default: module.GraphCanvas,
  })),
);

type Props = {
  theme: Theme;
  workspace: Pick<
    Workspace,
    | "graph"
    | "status"
    | "refreshCurrentGraph"
    | "graphLoading"
    | "setView"
    | "selectedId"
    | "onGraphSelect"
    | "expandNode"
    | "graphError"
    | "setConnectionOpenRequest"
    | "detail"
    | "detailLoading"
    | "detailError"
    | "inspect"
  >;
};

export function GraphWorkspace({ workspace, theme }: Props) {
  const {
    graph,
    status,
    refreshCurrentGraph,
    graphLoading,
    setView,
    selectedId,
    onGraphSelect,
    expandNode,
    graphError,
    setConnectionOpenRequest,
    detail,
    detailLoading,
    detailError,
    inspect,
  } = workspace;
  return (
    <div className="graph-view">
      <section className="graph-workspace">
        <header className="view-toolbar">
          <div>
            <span className="eyebrow">WORKSPACE / EXPLORE</span>
            <h1>Graph explorer</h1>
            <p>
              {graph
                ? `${graph.nodes.length.toLocaleString()} nodes · ${graph.edges.length.toLocaleString()} edges`
                : "A map of your nodes and relationships."}
            </p>
          </div>
          <div className="view-toolbar-actions">
            {status.kind !== "disconnected" ? (
              <Button
                variant="outline"
                onClick={refreshCurrentGraph}
                disabled={graphLoading}
              >
                <RefreshCw size={14} className={graphLoading ? "spinning" : undefined} />
                {graphLoading ? "Refreshing…" : "Refresh"}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setView("query")}>
              <TerminalSquare size={14} /> Edit graph query
            </Button>
          </div>
        </header>
        <div className="graph-stage">
          {graph && graph.nodes.length > 0 ? (
            <Suspense
              fallback={
                <div className="empty-state">
                  <span className="loading-ring" />
                  Loading graph…
                </div>
              }
            >
              <GraphCanvas
                graph={graph}
                theme={theme}
                selectedId={selectedId}
                onSelect={onGraphSelect}
                onExpand={expandNode}
              />
            </Suspense>
          ) : graphLoading ? (
            <div className="empty-state graph-empty" role="status">
              <span className="loading-ring" aria-hidden="true" />
              <h2>Syncing graph data</h2>
              <p>Loading the current nodes and relationships from HelixDB…</p>
            </div>
          ) : graphError ? (
            <div className="empty-state graph-empty graph-error" role="alert">
              <span className="empty-icon" aria-hidden="true">
                !
              </span>
              <h2>Couldn’t load the graph</h2>
              <p>{graphError}</p>
              <Button
                variant="default"
                className="primary"
                onClick={refreshCurrentGraph}
              >
                Retry
              </Button>
            </div>
          ) : status.kind !== "connected" ? (
            <GraphWelcome onConnect={() => setConnectionOpenRequest((value) => value + 1)} />
          ) : (
            <div className="empty-state graph-empty">
              <span className="empty-icon" aria-hidden="true">
                <Network size={24} strokeWidth={1.5} />
              </span>
              <h2>No graph data found</h2>
              <p>
                The connected instance did not return any nodes or
                relationships.
              </p>
              <Button
                variant="default"
                className="primary"
                onClick={refreshCurrentGraph}
              >
                Refresh
              </Button>
            </div>
          )}
        </div>
        {graph && <GraphCaveats graph={graph} />}
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

/** States plainly where the drawn graph is not the whole truth. */
function GraphCaveats({ graph }: { graph: GraphData }) {
  const notes: string[] = [];
  if (graph.truncatedNodes)
    notes.push("the node limit was reached — raise it with LIMIT");
  if (graph.truncatedEdges)
    notes.push("the edge limit was reached — raise it with EDGE LIMIT");
  if (graph.danglingEdges > 0) {
    notes.push(
      `${graph.danglingEdges.toLocaleString()} edge${graph.danglingEdges === 1 ? "" : "s"} left the selection and ${graph.danglingEdges === 1 ? "is" : "are"} not drawn`,
    );
  }
  if (notes.length === 0) return null;
  return <p className="graph-caveats">Note: {notes.join("; ")}.</p>;
}
