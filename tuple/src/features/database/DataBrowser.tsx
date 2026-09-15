import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Play, RefreshCw, Table2 } from "@/components/ui/animated-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { runQuery, updateCell } from "@/lib/database-api"
import type { QueryResult, TableSchema } from "@/lib/types"
import { quoteIdentifier } from "@/lib/utils"
import { ResultGrid } from "./ResultGrid"

export function DataBrowser({ connectionId, table, readOnly, onOpenQuery }: { connectionId: string; table: TableSchema | null; readOnly: boolean; onOpenQuery: () => void }) {
  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(Boolean(table))
  const editable = Boolean(!readOnly && table?.kind === "table" && table.columns.some((column) => column.primaryKey))
  const editStatus = editable ? "EDITABLE" : readOnly ? "READ ONLY" : table?.kind === "view" ? "VIEW ONLY" : "NO PRIMARY KEY"

  const loadRows = async () => {
    if (!table) return
    setLoading(true)
    try {
      setResult(await runQuery(connectionId, `SELECT * FROM ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)} LIMIT 500;`, 500))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load table rows")
    } finally {
      setLoading(false)
    }
  }

  const saveCell = async (row: Record<string, unknown>, column: string, value: unknown) => {
    if (!table) return
    const target = table.columns.find((entry) => entry.name === column)
    const primaryKeys = table.columns.filter((entry) => entry.primaryKey)
    if (!target || primaryKeys.length === 0) throw new Error("This table needs a primary key before rows can be edited.")
    const response = await updateCell({
      connectionId,
      schema: table.schema,
      table: table.name,
      column,
      dataType: target.dataType,
      value,
      primaryKeys: primaryKeys.map((key) => ({ column: key.name, dataType: key.dataType, value: row[key.name] })),
    })
    if (response.affectedRows > 1) throw new Error("The update matched more than one row. Refresh and verify the table key.")
    setResult((current) => current ? { ...current, rows: current.rows.map((entry) => entry === row ? { ...entry, [column]: value } : entry) } : current)
  }

  useEffect(() => {
    let current = true
    if (!table) return
    void runQuery(connectionId, `SELECT * FROM ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)} LIMIT 500;`, 500)
      .then((next) => { if (current) setResult(next) })
      .catch((error: unknown) => { if (current) toast.error(error instanceof Error ? error.message : "Could not load table rows") })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [connectionId, table])

  if (!table) return <Empty className="h-full"><EmptyHeader><EmptyMedia><Table2 className="size-4"/></EmptyMedia><EmptyTitle>Choose a table to browse</EmptyTitle><EmptyDescription>Select any table from the schema explorer.</EmptyDescription></EmptyHeader></Empty>
  return <div className="flex h-full min-h-0 flex-col bg-background">
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/80 bg-background px-4">
      <span className="grid size-8 place-items-center rounded-lg border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.05)]"><Table2 className="size-3.5 text-primary"/></span>
      <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-xs font-semibold tracking-[-0.01em]">{table.name}</span><Badge variant={table.kind === "view" ? "secondary" : "outline"}>{table.kind.toUpperCase()}</Badge><Badge variant={editable ? "success" : "outline"}>{editStatus}</Badge></div><p className="mt-0.5 text-[9px] text-muted-foreground">{table.schema} · up to 500 rows</p></div>
      <ButtonGroup className="ml-auto"><Button size="sm" variant="outline" disabled={loading} className="text-[7px]" onClick={() => void loadRows()}><RefreshCw className={loading ? "animate-spin" : ""}/>{loading ? "Refreshing…" : "Refresh"}</Button><Button size="sm" className="text-[7px]" onClick={onOpenQuery}><Play className="fill-current"/>Open in Query</Button></ButtonGroup>
    </div>
    <div className="min-h-0 flex-1"><ResultGrid result={result} loading={loading} editable={editable} table={table} onUpdateCell={saveCell}/></div>
  </div>
}
