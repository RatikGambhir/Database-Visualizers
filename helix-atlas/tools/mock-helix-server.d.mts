import type { Server } from "node:http";
interface Entity { id: bigint; label: string; properties: Record<string, unknown>; from?: bigint; to?: bigint }
export interface MockGraph { nodes: Map<bigint, Entity>; edges: Map<bigint, Entity> }
export function createMockServer(options?: { seed?: number }): { server: Server; graph: MockGraph };
export function dispatchRead(path: string, parsed: unknown, graph: MockGraph): unknown;
export function parseJsonBig(text: string): any;
export function stringifyBig(value: unknown): string;
