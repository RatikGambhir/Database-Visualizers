import { toast } from "sonner"
import { Copy, Eye, KeyRound, Link2, MoreHorizontal, Table2 } from "@/components/ui/animated-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import type { TableSchema } from "@/lib/types"

export function TableInspector({ table }: { table: TableSchema | null }) {
  if (!table) return <aside className="hidden w-[304px] shrink-0 border-l border-border bg-background 2xl:flex"><Empty><EmptyHeader><EmptyMedia><Table2 className="size-4"/></EmptyMedia><EmptyTitle>Select a table</EmptyTitle><EmptyDescription>Column details and relationships appear here.</EmptyDescription></EmptyHeader></Empty></aside>
  const foreignColumns = new Map(table.foreignKeys.map((key) => [key.fromColumn, key]))
  const copyName = async () => { await navigator.clipboard.writeText(`${table.schema}.${table.name}`); toast.success("Table name copied") }
  return <aside className="hidden w-[304px] shrink-0 border-l border-border bg-background 2xl:flex 2xl:min-h-0 2xl:flex-col">
    <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-border px-3"><span className="grid size-7 place-items-center border-r border-primary bg-primary/10">{table.kind === "view" ? <Eye className="size-3.5 text-relationship"/> : <Table2 className="size-3.5 text-primary"/>}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold tracking-[-0.01em]">{table.name}</p><p className="font-mono text-[9px] uppercase text-muted-foreground">{table.schema} / {table.kind}</p></div><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Table actions"><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => void copyName()}><Copy/>Copy qualified name</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
    <div className="p-3"><Card className="grid grid-cols-2 divide-x divide-border overflow-hidden"><Metric label="Columns" value={table.columns.length}/><Metric label="Rows" value={table.rowCount == null ? "—" : new Intl.NumberFormat().format(table.rowCount)}/></Card></div>
    <Separator className="opacity-70" />
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-3"><p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Columns</p><ItemGroup>{table.columns.map((column) => <Item key={column.name} className="items-start px-2.5"><ItemMedia>{column.primaryKey ? <KeyRound className="text-primary"/> : foreignColumns.has(column.name) ? <Link2 className="text-relationship"/> : <span className="size-1 rounded-full bg-muted-foreground/45"/>}</ItemMedia><ItemContent><ItemTitle className="text-[10px]">{column.name}</ItemTitle><ItemDescription className="text-[9px]">{column.dataType}{column.defaultValue ? ` · ${column.defaultValue}` : ""}</ItemDescription>{foreignColumns.has(column.name) ? <ItemDescription className="text-[9px] text-relationship">→ {foreignColumns.get(column.name)?.toSchema}.{foreignColumns.get(column.name)?.toTable}.{foreignColumns.get(column.name)?.toColumn}</ItemDescription> : null}</ItemContent>{column.nullable ? <ItemActions><Badge variant="outline">NULL</Badge></ItemActions> : null}</Item>)}</ItemGroup></div>
    </ScrollArea>
    {table.foreignKeys.length ? <><Separator/><div className="flex items-center gap-2 p-3 text-[9px] text-muted-foreground"><span className="size-1.5 rounded-full bg-relationship"/>{table.foreignKeys.length} outbound relationship{table.foreignKeys.length === 1 ? "" : "s"}</div></> : null}
  </aside>
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="px-3 py-2.5"><p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 text-[13px] font-semibold tabular-nums">{value}</p></div> }
