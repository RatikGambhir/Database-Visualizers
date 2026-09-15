import { useEffect, useState } from "react"
import { Play, RefreshCw, Table2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { runQuery } from "@/lib/database-api"
import type { QueryResult, TableSchema } from "@/lib/types"
import { quoteIdentifier } from "@/lib/utils"
import { ResultGrid } from "./ResultGrid"

export function DataBrowser({ connectionId, table, onOpenQuery }: { connectionId: string; table: TableSchema | null; onOpenQuery: () => void }) {
  const [result, setResult] = useState<QueryResult | null>(null)
  const [loading, setLoading] = useState(Boolean(table))

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

  useEffect(() => {
    let current = true
    if (!table) return
    void runQuery(connectionId, `SELECT * FROM ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)} LIMIT 500;`, 500)
      .then((next) => { if (current) setResult(next) })
      .catch((error: unknown) => { if (current) toast.error(error instanceof Error ? error.message : "Could not load table rows") })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [connectionId, table])

  if (!table) return <div className="grid h-full place-items-center"><div className="text-center"><Table2 className="mx-auto mb-3 size-6 text-muted-foreground"/><p className="text-sm font-medium">Choose a table to browse</p><p className="mt-1 text-xs text-muted-foreground">Select any table from the schema explorer.</p></div></div>
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <div className="flex items-center gap-2 text-xs"><span className="text-muted-foreground">{table.schema}</span><span className="text-muted-foreground/40">/</span><span className="font-semibold">{table.name}</span><Badge variant={table.kind === "view" ? "secondary" : "outline"}>{table.kind.toUpperCase()}</Badge></div>
      <div className="ml-auto flex items-center gap-1"><Button size="sm" variant="outline" disabled={loading} onClick={() => void loadRows()}><RefreshCw className={loading ? "animate-spin" : ""}/>Refresh</Button><Button size="sm" onClick={onOpenQuery}><Play className="fill-current"/>Open in query</Button></div>
    </div>
    <div className="min-h-0 flex-1"><ResultGrid result={result} loading={loading}/></div>
  </div>
}
