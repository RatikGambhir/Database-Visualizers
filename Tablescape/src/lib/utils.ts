import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { DatabaseKind } from "@/lib/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function quoteIdentifier(value: string, dialect: DatabaseKind) {
  const quote = dialect === "mysql" ? "`" : '"'
  return `${quote}${value.replaceAll(quote, quote.repeat(2))}${quote}`
}

export function qualifyTable(schema: string, table: string, dialect: DatabaseKind) {
  return `${quoteIdentifier(schema, dialect)}.${quoteIdentifier(table, dialect)}`
}

export function formatDuration(ms: number) {
  if (ms < 1) return "<1 ms"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}
