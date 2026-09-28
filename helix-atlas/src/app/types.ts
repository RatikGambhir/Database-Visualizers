import type { CompiledQuery } from "../client";
import type { QueryResult } from "../results";

export type AppView = "query" | "schema" | "graph";
export type OutputTab = "results" | "wire";

export interface RunState {
  running: boolean;
  result: QueryResult | null;
  compiled: CompiledQuery | null;
  durationMs: number | null;
  error: { message: string; detail: string | null } | null;
}

export const IDLE: RunState = {
  running: false,
  result: null,
  compiled: null,
  durationMs: null,
  error: null,
};

export type ConnectionStatus =
  | { kind: "disconnected" }
  | { kind: "checking" }
  | { kind: "connected"; durationMs: number }
  | { kind: "failed"; message: string };
