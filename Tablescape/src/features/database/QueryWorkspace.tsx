import { useState } from "react"
import { toast } from "sonner"
import { Braces, ChevronDown, Clock3, Play, RotateCcw, Sparkles } from "@/components/ui/animated-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Kbd } from "@/components/ui/kbd"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { runQuery } from "@/lib/database-api"
import type { DatabaseKind, QueryHistoryItem, QueryResult, TableSchema } from "@/lib/types"
import { qualifyTable } from "@/lib/utils"
import { ResultGrid } from "./ResultGrid"

interface QueryWorkspaceProps {
  connectionId: string
  dialect: DatabaseKind
  initialTable: TableSchema | null
  readOnly: boolean
}

const starterSql = "SELECT 1 AS result;"

export function QueryWorkspace({ connectionId, dialect, initialTable, readOnly }: QueryWorkspaceProps) {
  const tableSql = initialTable ? `SELECT *\nFROM ${qualifyTable(initialTable.schema, initialTable.name, dialect)}\nLIMIT 100;` : starterSql
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
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="flex items-center gap-2"><span className="h-5 w-0.5 bg-primary"/><span className="text-xs font-semibold">Query 1</span><span className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground">Unsaved</span></div>
        <ButtonGroup className="ml-auto">
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm">Templates <ChevronDown/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Query templates</DropdownMenuLabel><DropdownMenuItem onSelect={() => setSql(listTablesSql(dialect))}>List all tables</DropdownMenuItem><DropdownMenuItem onSelect={() => setSql(inspectColumnsSql(dialect))}>Inspect columns</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onSelect={() => setSql(tableSql)}>Select current table</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          <Button variant="ghost" size="icon-sm" aria-label="Reset query" onClick={() => setSql(tableSql)}><RotateCcw/></Button>
          <Button size="sm" onClick={() => void execute()} disabled={running}><Play className="fill-current"/>{running ? "Running…" : "Run Query"}<Kbd className="ml-1 min-h-4 border-primary-foreground/20 bg-transparent px-1 py-0 text-primary-foreground">⌘↵</Kbd></Button>
        </ButtonGroup>
      </div>
      <div className="editor-shell min-h-0 flex-1">
        <div className="editor-gutter" aria-hidden="true">{sql.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div>
        <Textarea aria-label="SQL query" value={sql} onChange={(event) => setSql(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void execute() } }} spellCheck={false} className="h-full min-h-0 rounded-none border-0 bg-transparent px-4 py-3 font-mono text-[13px] leading-6 shadow-none focus-visible:ring-0" />
      </div>
      <div className="flex h-7 items-center border-t border-border px-3 font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground"><Braces className="mr-1.5 size-3"/>SQL<span className="ml-auto">Rows limited to 500</span></div>
    </section>
    <section className="flex min-h-0 flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center border-b border-border px-2"><Tabs value={bottomTab} onValueChange={setBottomTab}><TabsList variant="line" size="sm"><TabsTrigger value="results">Results{result ? <Badge variant="secondary" className="ml-1.5">{result.rows.length}</Badge> : null}</TabsTrigger><TabsTrigger value="history">History<Badge variant="secondary" className="ml-1.5">{history.length}</Badge></TabsTrigger></TabsList></Tabs></div>
      <div className="min-h-0 flex-1">{bottomTab === "results" ? <ResultGrid result={result} loading={running}/> : <HistoryList history={history} onRestore={(entry) => { setSql(entry.sql); setBottomTab("results") }} />}</div>
    </section>
  </div>
}

function listTablesSql(dialect: DatabaseKind) {
  if (dialect === "sqlite" || dialect === "sql-file") return "SELECT name, type\nFROM sqlite_master\nWHERE type IN ('table', 'view')\n  AND name NOT LIKE 'sqlite_%'\nORDER BY name;"
  if (dialect === "mysql") return "SELECT table_schema, table_name, table_type\nFROM information_schema.tables\nWHERE table_schema = DATABASE()\nORDER BY table_name;"
  return "SELECT table_schema, table_name, table_type\nFROM information_schema.tables\nWHERE table_schema NOT IN ('pg_catalog', 'information_schema')\nORDER BY table_schema, table_name;"
}

function inspectColumnsSql(dialect: DatabaseKind) {
  if (dialect === "sqlite" || dialect === "sql-file") return "SELECT m.name AS table_name, p.name AS column_name, p.type AS data_type, p.notnull AS required\nFROM sqlite_master m\nJOIN pragma_table_info(m.name) p\nWHERE m.type = 'table'\nORDER BY m.name, p.cid;"
  const scope = dialect === "mysql" ? "WHERE table_schema = DATABASE()" : "WHERE table_schema NOT IN ('pg_catalog', 'information_schema')"
  return `SELECT table_schema, table_name, column_name, data_type\nFROM information_schema.columns\n${scope}\nORDER BY table_schema, table_name, ordinal_position;`
}

function HistoryList({ history, onRestore }: { history: QueryHistoryItem[]; onRestore: (entry: QueryHistoryItem) => void }) {
  if (!history.length) return <Empty className="h-full"><EmptyHeader><EmptyMedia><Clock3 className="size-4"/></EmptyMedia><EmptyTitle>No query history yet</EmptyTitle><EmptyDescription>Queries from this session will appear here.</EmptyDescription></EmptyHeader></Empty>
  return <ScrollArea className="h-full"><div className="divide-y divide-border">{history.map((entry) => <Button key={entry.id} variant="ghost" onClick={() => onRestore(entry)} className="h-auto w-full justify-start rounded-none px-4 py-3 text-left font-normal"><span className={`size-1.5 rounded-full ${entry.status === "success" ? "bg-emerald-400" : "bg-red-400"}`}/><code className="min-w-0 flex-1 truncate text-xs">{entry.sql.replaceAll("\n", " ")}</code><span className="text-[10px] text-muted-foreground">{entry.executedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><Sparkles className="size-3 text-muted-foreground"/></Button>)}</div></ScrollArea>
}
