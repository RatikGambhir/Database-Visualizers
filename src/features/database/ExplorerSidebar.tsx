import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Database, Eye, FileCode2, Plus, Search, Table2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ConnectionProfile, DatabaseSchema, TableSchema } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ExplorerSidebarProps {
  connection: ConnectionProfile
  schema: DatabaseSchema
  selectedTable: string | null
  onSelectTable: (table: TableSchema) => void
  onAddConnection: () => void
}

export function ExplorerSidebar({ connection, schema, selectedTable, onSelectTable, onAddConnection }: ExplorerSidebarProps) {
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(schema.tables.map((table) => table.schema)))
  const grouped = useMemo(() => {
    const groups = new Map<string, TableSchema[]>()
    for (const table of schema.tables) {
      if (query && !`${table.schema}.${table.name}`.toLowerCase().includes(query.toLowerCase())) continue
      groups.set(table.schema, [...(groups.get(table.schema) ?? []), table])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [query, schema.tables])

  const toggleSchema = (name: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })

  return (
    <aside className="flex h-full min-h-0 w-[270px] shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="app-drag flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-3">
        <div className="no-drag logo-mark"><span /><span /><span /></div>
        <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold tracking-tight">Tuple</div><div className="text-[9px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Database workbench</div></div>
        <Tooltip><TooltipTrigger asChild><Button className="no-drag" variant="ghost" size="icon-sm" aria-label="Add connection" onClick={onAddConnection}><Plus /></Button></TooltipTrigger><TooltipContent>Add connection</TooltipContent></Tooltip>
      </div>

      <div className="px-3 pb-2 pt-3">
        <div className="mb-2 flex items-center gap-2 px-1"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40"/><span className="relative inline-flex size-2 rounded-full bg-emerald-400"/></span><span className="min-w-0 flex-1 truncate text-xs font-medium">{connection.name}</span><Badge variant={connection.readOnly ? "outline" : "warning"}>{connection.readOnly ? "READ" : "WRITE"}</Badge></div>
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter tables…" className="h-8 bg-background/60 pl-8 text-xs" /></div>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="pb-4 pt-1">
          <div className="flex items-center justify-between px-2 py-1.5"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Schemas</span><span className="font-mono text-[10px] text-muted-foreground">{grouped.length}</span></div>
          {grouped.map(([schemaName, tables]) => {
            const isOpen = expanded.has(schemaName)
            return <div key={schemaName} className="mb-0.5">
              <Button variant="ghost" size="sm" className="h-7 w-full justify-start gap-1.5 px-2 font-normal text-muted-foreground hover:text-foreground" onClick={() => toggleSchema(schemaName)}>{isOpen ? <ChevronDown className="size-3"/> : <ChevronRight className="size-3"/>}<Database className="size-3.5"/><span className="truncate text-xs">{schemaName}</span><span className="ml-auto font-mono text-[10px] opacity-60">{tables.length}</span></Button>
              {isOpen ? <div className="relative ml-[15px] border-l border-border/70 pl-1.5">
                {tables.map((table) => {
                  const id = `${table.schema}.${table.name}`
                  return <Button key={id} variant="ghost" size="sm" className={cn("relative h-7 w-full justify-start gap-2 px-2 font-normal text-muted-foreground", selectedTable === id && "bg-accent text-accent-foreground")} onClick={() => onSelectTable(table)}>{table.kind === "view" ? <Eye className="size-3.5 text-sky-400"/> : <Table2 className="size-3.5 text-muted-foreground"/>}<span className="truncate text-xs">{table.name}</span>{table.rowCount != null ? <span className="ml-auto font-mono text-[9px] opacity-55">{compactCount(table.rowCount)}</span> : null}</Button>
                })}
              </div> : null}
            </div>
          })}
          {grouped.length === 0 ? <div className="mx-2 mt-6 rounded-lg border border-dashed border-border px-3 py-6 text-center"><FileCode2 className="mx-auto mb-2 size-5 text-muted-foreground"/><p className="text-xs text-muted-foreground">No matching tables</p></div> : null}
        </div>
      </ScrollArea>

      <Separator />
      <div className="grid gap-1 p-3 text-[10px] text-muted-foreground"><div className="flex justify-between"><span>{schema.tables.length} objects</span><span>{schema.tables.reduce((total, table) => total + table.columns.length, 0)} columns</span></div><div className="truncate font-mono opacity-70">{connection.detail}</div></div>
    </aside>
  )
}

function compactCount(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}
