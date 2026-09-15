import { useState } from "react"
import { Braces, ChevronDown, Clock3, Play, RotateCcw, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { runQuery } from "@/lib/database-api"
import type { QueryHistoryItem, QueryResult, TableSchema } from "@/lib/types"
import { quoteIdentifier } from "@/lib/utils"
import { ResultGrid } from "./ResultGrid"

interface QueryWorkspaceProps {
  connectionId: string
  initialTable: TableSchema | null
  readOnly: boolean
}

const starterSql = `SELECT
  o.id,
  c.full_name AS customer,
  c.email,
  o.status,
  o.total_cents,
  o.placed_at
FROM public.orders o
JOIN public.customers c ON c.id = o.customer_id
ORDER BY o.placed_at DESC
LIMIT 100;`

export function QueryWorkspace({ connectionId, initialTable, readOnly }: QueryWorkspaceProps) {
  const tableSql = initialTable ? `SELECT *\nFROM ${quoteIdentifier(initialTable.schema)}.${quoteIdentifier(initialTable.name)}\nLIMIT 100;` : starterSql
  const [sql, setSql] = useState(tableSql)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const [bottomTab, setBottomTab] = useState("results")
  const [history, setHistory] = useState<QueryHistoryItem[]>([])

  const execute = async () => {
    if (!sql.trim() || running) return
    if (readOnly && /\b(insert|update|delete|drop|alter|truncate|create)\b/i.test(sql)) {
      toast.error("This connection is read-only. Reconnect in editable mode to run mutations.")
      return
    }
    setRunning(true)
    setBottomTab("results")
    const started = performance.now()
    try {
      const next = await runQuery(connectionId, sql, 500)
      setResult(next)
      setHistory((current) => [{ id: crypto.randomUUID(), sql, executedAt: new Date(), durationMs: next.durationMs, status: "success" as const }, ...current].slice(0, 30))
    } catch (error) {
      setHistory((current) => [{ id: crypto.randomUUID(), sql, executedAt: new Date(), durationMs: performance.now() - started, status: "error" as const }, ...current].slice(0, 30))
      toast.error(error instanceof Error ? error.message : "Query failed")
    } finally {
      setRunning(false)
    }
  }

  return <div className="grid h-full min-h-0 grid-rows-[minmax(210px,42%)_1fr]">
    <section className="flex min-h-0 flex-col border-b border-border bg-editor">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary"/><span className="text-xs font-medium">Query 1</span><span className="text-[10px] text-muted-foreground">Unsaved</span></div>
        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm">Templates <ChevronDown/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Query templates</DropdownMenuLabel><DropdownMenuItem onSelect={() => setSql("SELECT *\nFROM information_schema.tables\nORDER BY table_schema, table_name;")}>List all tables</DropdownMenuItem><DropdownMenuItem onSelect={() => setSql("SELECT table_schema, table_name, column_name, data_type\nFROM information_schema.columns\nORDER BY table_schema, table_name, ordinal_position;")}>Inspect columns</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onSelect={() => setSql(tableSql)}>Select current table</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          <Button variant="ghost" size="icon-sm" aria-label="Reset query" onClick={() => setSql(tableSql)}><RotateCcw/></Button>
          <Button size="sm" onClick={() => void execute()} disabled={running}><Play className="fill-current"/>{running ? "Running…" : "Run"}<kbd className="ml-1 rounded border border-primary-foreground/20 px-1 py-px text-[9px]">⌘↵</kbd></Button>
        </div>
      </div>
      <div className="editor-shell min-h-0 flex-1">
        <div className="editor-gutter" aria-hidden="true">{sql.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div>
        <Textarea aria-label="SQL query" value={sql} onChange={(event) => setSql(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void execute() } }} spellCheck={false} className="h-full min-h-0 rounded-none border-0 bg-transparent px-4 py-3 font-mono text-[13px] leading-6 shadow-none focus-visible:ring-0" />
      </div>
      <div className="flex h-7 items-center border-t border-border px-3 text-[10px] text-muted-foreground"><Braces className="mr-1.5 size-3"/>SQL<span className="ml-auto">Rows limited to 500</span></div>
    </section>
    <section className="flex min-h-0 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-2"><Tabs value={bottomTab} onValueChange={setBottomTab}><TabsList className="bg-transparent"><TabsTrigger value="results">Results{result ? <span className="ml-1.5 rounded bg-muted px-1 font-mono text-[9px]">{result.rows.length}</span> : null}</TabsTrigger><TabsTrigger value="history">History<span className="ml-1.5 rounded bg-muted px-1 font-mono text-[9px]">{history.length}</span></TabsTrigger></TabsList></Tabs></div>
      <div className="min-h-0 flex-1">{bottomTab === "results" ? <ResultGrid result={result} loading={running}/> : <HistoryList history={history} onRestore={(entry) => { setSql(entry.sql); setBottomTab("results") }} />}</div>
    </section>
  </div>
}

function HistoryList({ history, onRestore }: { history: QueryHistoryItem[]; onRestore: (entry: QueryHistoryItem) => void }) {
  if (!history.length) return <div className="grid h-full place-items-center text-center"><div><Clock3 className="mx-auto mb-3 size-5 text-muted-foreground"/><p className="text-sm font-medium">No query history yet</p><p className="mt-1 text-xs text-muted-foreground">Queries from this session will appear here.</p></div></div>
  return <div className="divide-y divide-border">{history.map((entry) => <button key={entry.id} onClick={() => onRestore(entry)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30"><span className={`size-1.5 rounded-full ${entry.status === "success" ? "bg-emerald-400" : "bg-red-400"}`}/><code className="min-w-0 flex-1 truncate text-xs">{entry.sql.replaceAll("\n", " ")}</code><span className="text-[10px] text-muted-foreground">{entry.executedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><Sparkles className="size-3 text-muted-foreground"/></button>)}</div>
}
