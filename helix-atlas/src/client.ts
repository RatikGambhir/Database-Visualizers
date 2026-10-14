/**
 * Typed IPC boundary to the Rust application core.
 *
 * React sends user intent and renders returned view models. HQL parsing,
 * compilation, transport, response decoding, and schema inference all remain
 * in the Tauri process.
 */
import { invoke } from "@tauri-apps/api/core";

import type { QueryResult } from "./results";
import type { Schema } from "./schema";

export interface Span {
  start: number;
  end: number;
  line: number;
  column: number;
}

export type Protocol = "legacyV1" | "v2";
export type Deployment = "local" | "databaseCloud" | "sharedCloud";

export interface ConnectionView {
  revision: number;
  endpoint: string;
  url: string;
  protocol: Protocol;
  deployment: Deployment;
  databaseId: string | null;
  hasApiKey: boolean;
  timeoutMs: number;
  writerOnly: boolean;
}

export interface ConnectionUpdate {
  url: string;
  protocol: Protocol;
  deployment: Deployment;
  databaseId?: string | null;
  /** Omitted keeps the saved key only for the same endpoint. */
  apiKey?: string;
  timeoutMs: number;
  writerOnly: boolean;
}

export interface CompiledQuery {
  protocol: Protocol;
  executionKind: "read" | "write";
  mutation?: MutationPreview | null;
  endpointPath: string;
  endpoint: string;
  connectionRevision: number;
  transportJson: string;
  summary: string;
}

export type ParameterValue =
  | { type: "string" | "integer" | "nodeId"; value: string }
  | { type: "float"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "null" };
export type Parameters = Record<string, ParameterValue>;
export interface MutationPreview {
  plannedNodes: number;
  plannedEdges: number;
  statements: unknown[];
  parameters: { name: string; usage: "property" | "nodeId" | "string" }[];
  executable: boolean;
  blockedReason: string;
}

export interface QueryExecution {
  result: QueryResult;
  durationMs: number;
  compiled: CompiledQuery;
}

export interface ProbeResponse {
  durationMs: number;
}

export interface SchemaResponse {
  connectionRevision: number;
  schema: Schema;
  durationMs: number;
}

interface ErrorPayload {
  kind?: unknown;
  outcome?: unknown;
  message?: unknown;
  detail?: unknown;
  span?: unknown;
  hint?: unknown;
  status?: unknown;
  code?: unknown;
  statementIndex?: unknown;
  tupleIndex?: unknown;
}

/** A structured error produced by the Rust command boundary. */
export class BackendError extends Error {
  readonly kind: string;
  readonly outcome: string | null;
  readonly status: number | null;
  readonly code: string | null;
  readonly statementIndex: number | null;
  readonly tupleIndex: number | null;
  readonly detail: string | null;
  readonly span: Span | null;
  readonly hint: string | null;

  constructor(
    message: string,
    options: {
      kind?: string;
      outcome?: string | null;
      status?: number | null;
      code?: string | null;
      statementIndex?: number | null;
      tupleIndex?: number | null;
      detail?: string | null;
      span?: Span | null;
      hint?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "BackendError";
    this.kind = options.kind ?? "backend";
    this.outcome = options.outcome ?? null;
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.statementIndex = options.statementIndex ?? null;
    this.tupleIndex = options.tupleIndex ?? null;
    this.detail = options.detail ?? null;
    this.span = options.span ?? null;
    this.hint = options.hint ?? null;
  }
}

/** True when running inside the Tauri webview rather than a plain browser. */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isSpan(value: unknown): value is Span {
  if (typeof value !== "object" || value === null) return false;
  const span = value as Record<string, unknown>;
  return [span.start, span.end, span.line, span.column].every(
    (part) => typeof part === "number",
  );
}

function asBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  if (typeof error === "string") return new BackendError(error);
  if (typeof error === "object" && error !== null) {
    const payload = error as ErrorPayload;
    return new BackendError(
      typeof payload.message === "string" ? payload.message : String(error),
      {
        status: typeof payload.status === "number" ? payload.status : null,
        code: typeof payload.code === "string" ? payload.code : null,
        statementIndex: typeof payload.statementIndex === "number" ? payload.statementIndex : null,
        tupleIndex: typeof payload.tupleIndex === "number" ? payload.tupleIndex : null,
        kind: typeof payload.kind === "string" ? payload.kind : "backend",
        outcome: typeof payload.outcome === "string" ? payload.outcome : null,
        detail: typeof payload.detail === "string" ? payload.detail : null,
        span: isSpan(payload.span) ? payload.span : null,
        hint: typeof payload.hint === "string" ? payload.hint : null,
      },
    );
  }
  if (error instanceof Error) return new BackendError(error.message);
  return new BackendError(String(error));
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw asBackendError(error);
  }
}

export function getConnection(): Promise<ConnectionView> {
  return call("get_connection");
}

export function setConnection(update: ConnectionUpdate): Promise<ConnectionView> {
  return call("set_connection", { update });
}

export function compileQuery(source: string, parameters?: Parameters): Promise<CompiledQuery> {
  return call("compile_query", parameters ? { source, parameters } : { source });
}

export function runQuery(source: string, parameters?: Parameters): Promise<QueryExecution> {
  return call("run_query", parameters ? { source, parameters } : { source });
}

export function testConnection(connection: ConnectionUpdate): Promise<ProbeResponse> {
  return call("test_connection", { connection });
}

export function loadSchema(): Promise<SchemaResponse> {
  return call("load_schema");
}
