import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getConnection,
  isDesktop,
  loadSchema,
  runQuery,
  setConnection,
  testConnection,
  type ConnectionView,
  type ConnectionUpdate,
} from "../client";
import type { GraphSelectionEvent } from "../graph/GraphCanvas";
import type { GraphData, QueryResult } from "../results";
import type { Schema } from "../schema";
import { describeFailure, isConnectionFailure } from "./errors";
import {
  IDLE,
  type AppView,
  type OutputTab,
  type RunState,
  type ConnectionStatus,
} from "./types";
import { useQueryCompilation } from "./useQueryCompilation";

const INITIAL_QUERY = "QUERY LIMIT 300";
const HISTORY_LIMIT = 12;

/** Owns a connection session and invalidates pending requests together on reset. */
export function useWorkspace() {
  const desktop = useMemo(isDesktop, []);
  const [query, setQuery] = useState(INITIAL_QUERY);
  const [view, setView] = useState<AppView>("query");
  const [outputTab, setOutputTab] = useState<OutputTab>("results");
  const [run, setRun] = useState<RunState>(IDLE);
  const [history, setHistory] = useState<string[]>([]);

  const [connection, setConnectionView] = useState<ConnectionView | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>({
    kind: "disconnected",
  });
  const [connectionOpenRequest, setConnectionOpenRequest] = useState(0);

  const [schema, setSchema] = useState<Schema | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const schemaLoadId = useRef(0);
  const connectionGeneration = useRef(0);
  const runId = useRef(0);
  const detailLoadId = useRef(0);

  const [detail, setDetail] = useState<Extract<
    QueryResult,
    { kind: "describe" }
  > | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** The last graph produced, kept so the canvas survives a non-graph query. */
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const graphLoadAttempted = useRef(false);
  const graphLoadId = useRef(0);

  const { compileState, resetCompilation } = useQueryCompilation(
    desktop,
    query,
    connection?.revision,
  );

  // ---- transport helpers --------------------------------------------------

  /** Sends source text; Rust owns compilation, transport, and decoding. */
  const execute = useCallback((source: string) => runQuery(source), []);

  // ---- actions ------------------------------------------------------------

  const onRun = useCallback(async () => {
    const source = query.trim();
    const compiled =
      compileState.source === source ? compileState.compiled : null;
    if (!compiled) return;
    if (status.kind !== "connected") {
      setRun({
        running: false,
        result: null,
        compiled,
        durationMs: null,
        error: {
          message: "Connect to a HelixDB instance before running a query.",
          detail: null,
        },
      });
      return;
    }

    // A manual query supersedes any automatic graph snapshot still in flight.
    graphLoadId.current += 1;
    setGraphLoading(false);
    const requestId = ++runId.current;
    const generation = connectionGeneration.current;
    setRun({
      running: true,
      result: null,
      compiled,
      durationMs: null,
      error: null,
    });
    try {
      const execution = await execute(source);
      if (
        generation !== connectionGeneration.current ||
        requestId !== runId.current
      )
        return;
      const { result, durationMs } = execution;
      setRun({
        running: false,
        result,
        compiled: execution.compiled,
        durationMs,
        error: null,
      });
      setStatus({ kind: "connected", durationMs });

      if (result.kind === "graph") {
        setGraph(result.graph);
        setGraphError(null);
        graphLoadAttempted.current = true;
        setView("graph");
      } else if (result.kind === "describe") {
        setDetail(result);
        setDetailError(null);
        if (result.id) setSelectedId(result.id);
        setOutputTab("results");
        setView("query");
      } else {
        setOutputTab("results");
        setView("query");
      }

      setHistory((current) =>
        [source, ...current.filter((entry) => entry !== source)].slice(
          0,
          HISTORY_LIMIT,
        ),
      );
    } catch (error) {
      if (
        generation !== connectionGeneration.current ||
        requestId !== runId.current
      )
        return;
      const failure = describeFailure(error);
      setRun({
        running: false,
        result: null,
        compiled,
        durationMs: null,
        error: failure,
      });
      if (isConnectionFailure(error))
        setStatus({ kind: "failed", message: failure.message });
    }
  }, [compileState, execute, query, status.kind]);

  /** Loads a safe snapshot for the Graph workspace without changing the editor. */
  const loadCurrentGraph = useCallback(async () => {
    const requestId = ++graphLoadId.current;
    graphLoadAttempted.current = true;
    setGraphLoading(true);
    setGraphError(null);

    try {
      const execution = await execute(INITIAL_QUERY);
      const { result, durationMs, compiled } = execution;
      if (result.kind !== "graph")
        throw new Error("HelixDB returned a non-graph result.");
      if (requestId !== graphLoadId.current) return;

      setGraph(result.graph);
      setRun({ running: false, result, compiled, durationMs, error: null });
      setStatus({ kind: "connected", durationMs });
    } catch (error) {
      if (requestId !== graphLoadId.current) return;
      const failure = describeFailure(error);
      setGraphError(
        `${failure.message}${failure.detail ? ` — ${failure.detail}` : ""}`,
      );
      if (isConnectionFailure(error))
        setStatus({ kind: "failed", message: failure.message });
    } finally {
      if (requestId === graphLoadId.current) setGraphLoading(false);
    }
  }, [execute]);

  const refreshCurrentGraph = useCallback(() => {
    graphLoadAttempted.current = false;
    void loadCurrentGraph();
  }, [loadCurrentGraph]);

  const inspect = useCallback(
    async (kind: "node" | "edge", id: string) => {
      const requestId = ++detailLoadId.current;
      const generation = connectionGeneration.current;
      setSelectedId(id);
      setDetailLoading(true);
      setDetailError(null);
      try {
        const { result } = await execute(
          `DESCRIBE ${kind === "node" ? "NODE" : "EDGE"} ${id}`,
        );
        if (
          requestId !== detailLoadId.current ||
          generation !== connectionGeneration.current
        )
          return;
        setDetail(result.kind === "describe" ? result : null);
      } catch (error) {
        if (
          requestId !== detailLoadId.current ||
          generation !== connectionGeneration.current
        )
          return;
        setDetail(null);
        setDetailError(describeFailure(error).message);
      } finally {
        if (
          requestId === detailLoadId.current &&
          generation === connectionGeneration.current
        )
          setDetailLoading(false);
      }
    },
    [execute],
  );

  const refreshSchema = useCallback(async () => {
    const requestId = ++schemaLoadId.current;
    setSchemaLoading(true);
    setSchemaError(null);
    try {
      const { schema: nextSchema, durationMs } = await loadSchema();
      if (requestId !== schemaLoadId.current) return;
      setSchema(nextSchema);
      setStatus({ kind: "connected", durationMs });
    } catch (error) {
      if (requestId !== schemaLoadId.current) return;
      const failure = describeFailure(error);
      setSchemaError(failure.message);
      if (isConnectionFailure(error))
        setStatus({ kind: "failed", message: failure.message });
    } finally {
      if (requestId === schemaLoadId.current) setSchemaLoading(false);
    }
  }, []);

  const testCandidate = useCallback(async (update: ConnectionUpdate) => {
    try {
      const response = await testConnection(update);
      return response.durationMs;
    } catch (error) {
      const failure = describeFailure(error);
      throw new Error(
        `${failure.message}${failure.detail ? ` — ${failure.detail}` : ""}`,
      );
    }
  }, []);

  const saveConnection = useCallback(
    async (update: ConnectionUpdate) => {
      const generation = ++connectionGeneration.current;
      runId.current += 1;
      detailLoadId.current += 1;
      schemaLoadId.current += 1;
      graphLoadId.current += 1;
      setRun(IDLE);
      resetCompilation();
      setSchema(null);
      setSchemaLoading(false);
      setSchemaError(null);
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      setSelectedId(null);
      setGraphLoading(false);
      // Verify before persisting, so a bad URL never becomes the saved one.
      setStatus({ kind: "checking" });
      try {
        const durationMs = await testCandidate(update);
        if (generation !== connectionGeneration.current) return;
        const saved = await setConnection(update);
        if (generation !== connectionGeneration.current) return;
        setConnectionView(saved);
        graphLoadId.current += 1;
        graphLoadAttempted.current = false;
        setGraph(null);
        setGraphError(null);
        setGraphLoading(false);
        setStatus({ kind: "connected", durationMs });
      } catch (error) {
        if (generation !== connectionGeneration.current) return;
        const failure = describeFailure(error);
        setStatus({ kind: "failed", message: failure.message });
        throw new Error(
          `${failure.message}${failure.detail ? ` — ${failure.detail}` : ""}`,
        );
      }
      await refreshSchema();
    },
    [refreshSchema, resetCompilation, testCandidate],
  );

  const disconnect = useCallback(() => {
    connectionGeneration.current += 1;
    runId.current += 1;
    detailLoadId.current += 1;
    setDetailLoading(false);
    setSchemaLoading(false);
    setStatus({ kind: "disconnected" });
    schemaLoadId.current += 1;
    setSchema(null);
    setSchemaError(null);
    setDetail(null);
    setDetailError(null);
    setSelectedId(null);
    graphLoadId.current += 1;
    graphLoadAttempted.current = false;
    setGraph(null);
    setGraphError(null);
    setGraphLoading(false);
    setRun(IDLE);
    setView("query");
  }, []);

  const onGraphSelect = useCallback(
    (selection: GraphSelectionEvent | null) => {
      if (!selection) {
        setSelectedId(null);
        return;
      }
      void inspect(selection.kind, selection.id);
    },
    [inspect],
  );

  const expandNode = useCallback((nodeId: string) => {
    setQuery(`QUERY NODES\nWHERE id = ${nodeId}\nTRAVERSE BOTH\nLIMIT 200`);
  }, []);

  // ---- startup ------------------------------------------------------------

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const generation = connectionGeneration.current;
    void (async () => {
      try {
        const saved = await getConnection();
        if (generation === connectionGeneration.current)
          setConnectionView(saved);
      } catch {
        if (generation === connectionGeneration.current)
          setConnectionView(null);
      }
    })();
  }, []);

  // Match HelixDB Explorer: entering Graph fetches the current graph snapshot.
  useEffect(() => {
    if (
      view !== "graph" ||
      status.kind !== "connected" ||
      graph !== null ||
      graphLoading ||
      graphLoadAttempted.current
    )
      return;
    void loadCurrentGraph();
  }, [graph, graphLoading, loadCurrentGraph, status.kind, view]);

  const executedWire =
    run.result !== null &&
    run.compiled?.connectionRevision === connection?.revision &&
    run.compiled?.transportJson === compileState.compiled?.transportJson;
  const wireCompiled = executedWire ? run.compiled : compileState.compiled;
  return {
    desktop,
    query,
    setQuery,
    view,
    setView,
    outputTab,
    setOutputTab,
    run,
    history,
    connection,
    status,
    connectionOpenRequest,
    setConnectionOpenRequest,
    schema,
    schemaError,
    schemaLoading,
    detail,
    detailError,
    detailLoading,
    selectedId,
    graph,
    graphLoading,
    graphError,
    compileState,
    executedWire,
    wireCompiled,
    onRun,
    refreshCurrentGraph,
    inspect,
    refreshSchema,
    testCandidate,
    saveConnection,
    disconnect,
    onGraphSelect,
    expandNode,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;
