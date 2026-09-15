import { Copy, Eye, KeyRound, Link2, MoreHorizontal, Table2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { TableSchema } from "@/lib/types"

export function TableInspector({ table }: { table: TableSchema | null }) {
  if (!table) return <aside className="hidden w-[286px] shrink-0 border-l border-border bg-sidebar xl:grid xl:place-items-center"><div className="px-6 text-center"><Table2 className="mx-auto mb-3 size-5 text-muted-foreground"/><p className="text-xs font-medium">Select a table</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Column details and relationships will appear here.</p></div></aside>
  const foreignColumns = new Map(table.foreignKeys.map((key) => [key.fromColumn, key]))
  const copyName = async () => { await navigator.clipboard.writeText(`${table.schema}.${table.name}`); toast.success("Table name copied") }
  return <aside className="hidden w-[286px] shrink-0 border-l border-border bg-sidebar xl:flex xl:min-h-0 xl:flex-col">
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">{table.kind === "view" ? <Eye className="size-4 text-sky-400"/> : <Table2 className="size-4 text-primary"/>}<div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{table.name}</p><p className="font-mono text-[9px] text-muted-foreground">{table.schema}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void copyName()}><Copy/>Copy qualified name</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    <div className="grid grid-cols-2 gap-2 p-3"><Metric label="Columns" value={table.columns.length}/><Metric label="Rows" value={table.rowCount == null ? "—" : new Intl.NumberFormat().format(table.rowCount)}/></div>
    <Separator />
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Columns</p><div className="grid gap-1">{table.columns.map((column) => <div key={column.name} className="rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-muted/25"><div className="flex items-center gap-2"><span className="grid size-4 place-items-center">{column.primaryKey ? <KeyRound className="size-3 text-amber-400"/> : foreignColumns.has(column.name) ? <Link2 className="size-3 text-sky-400"/> : <span className="size-1 rounded-full bg-muted-foreground/45"/>}</span><span className="min-w-0 flex-1 truncate font-mono text-[11px]">{column.name}</span>{column.nullable ? <Badge variant="outline">NULL</Badge> : null}</div><div className="ml-6 mt-1 flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground"><span>{column.dataType}</span>{column.defaultValue ? <><span>·</span><span className="truncate">{column.defaultValue}</span></> : null}</div>{foreignColumns.has(column.name) ? <p className="ml-6 mt-1 truncate text-[9px] text-sky-400/80">→ {foreignColumns.get(column.name)?.toSchema}.{foreignColumns.get(column.name)?.toTable}.{foreignColumns.get(column.name)?.toColumn}</p> : null}</div>)}</div></div>
    </ScrollArea>
    {table.foreignKeys.length ? <><Separator/><div className="p-3 text-[10px] text-muted-foreground">{table.foreignKeys.length} outbound relationship{table.foreignKeys.length === 1 ? "" : "s"}</div></> : null}
  </aside>
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg border border-border bg-background/35 p-2.5"><p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-mono text-sm font-semibold">{value}</p></div> }
