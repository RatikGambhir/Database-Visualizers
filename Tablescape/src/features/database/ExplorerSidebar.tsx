import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Database, Eye, FileCode2, Plus, Search, Table2 } from "@/components/ui/animated-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
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
    <aside className="hidden h-full min-h-0 w-[264px] shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="app-drag flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-3">
        <div className="no-drag logo-mark"><span /><span /><span /></div>
        <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold tracking-[-0.015em]">Tablescape</div><div className="font-mono text-[8px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Database workbench</div></div>
        <Tooltip><TooltipTrigger asChild><Button className="no-drag" variant="ghost" size="icon-sm" aria-label="Add connection" onClick={onAddConnection}><Plus /></Button></TooltipTrigger><TooltipContent>Add connection</TooltipContent></Tooltip>
      </div>

      <div className="space-y-2 px-3 pb-3 pt-3">
        <Card className="flex items-center gap-2 border-l-2 border-l-emerald-500 px-2.5 py-2"><span className="size-1.5 bg-emerald-500"/><span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{connection.name}</span><Badge variant={connection.readOnly ? "outline" : "warning"}>{connection.readOnly ? "READ" : "WRITE"}</Badge></Card>
        <InputGroup className="h-8"><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter tables…" aria-label="Filter schema objects" autoComplete="off" className="pl-1 text-xs" /></InputGroup>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="pb-4 pt-1">
          <div className="flex items-center justify-between px-2 pb-2 pt-1"><span className="font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Schemas</span><span className="font-mono text-[9px] text-muted-foreground">{String(grouped.length).padStart(2, "0")}</span></div>
          {grouped.map(([schemaName, tables]) => {
            const isOpen = expanded.has(schemaName)
            return <div key={schemaName} className="mb-0.5">
              <Button variant="ghost" size="sm" className="h-8 w-full justify-start gap-1.5 px-2 font-normal text-muted-foreground hover:text-foreground" onClick={() => toggleSchema(schemaName)}>{isOpen ? <ChevronDown className="size-3"/> : <ChevronRight className="size-3"/>}<Database className="size-3.5"/><span className="truncate text-xs font-medium">{schemaName}</span><span className="ml-auto text-[9px] tabular-nums opacity-60">{tables.length}</span></Button>
              {isOpen ? <div className="relative ml-[15px] border-l border-border/70 pl-1.5">
                {tables.map((table) => {
                  const id = `${table.schema}.${table.name}`
                  return <Button key={id} variant="ghost" size="sm" className={cn("relative h-8 w-full justify-start gap-2 px-2 font-normal text-muted-foreground", selectedTable === id && "bg-accent text-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary")} onClick={() => onSelectTable(table)}>{table.kind === "view" ? <Eye className="size-3.5 text-relationship"/> : <Table2 className={cn("size-3.5", selectedTable === id ? "text-primary" : "text-muted-foreground")}/>}<span className="truncate text-xs">{table.name}</span>{table.rowCount != null ? <span className="ml-auto text-[9px] tabular-nums opacity-55">{compactCount(table.rowCount)}</span> : null}</Button>
                })}
              </div> : null}
            </div>
          })}
          {grouped.length === 0 ? <Empty className="mx-2 mt-6 rounded-[3px] border border-dashed border-border py-6"><EmptyHeader><EmptyMedia variant="plain"><FileCode2 className="size-5"/></EmptyMedia><EmptyDescription>No matching tables</EmptyDescription></EmptyHeader></Empty> : null}
        </div>
      </ScrollArea>

      <Separator />
      <div className="grid gap-1.5 p-3 text-[9px] text-muted-foreground"><div className="flex justify-between tabular-nums"><span>{schema.tables.length} objects</span><span>{schema.tables.reduce((total, table) => total + table.columns.length, 0)} columns</span></div><div className="truncate opacity-65">{connection.detail}</div></div>
    </aside>
  )
}

function compactCount(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}
