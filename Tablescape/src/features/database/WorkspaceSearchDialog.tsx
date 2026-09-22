import { useMemo, useState } from "react"
import { Eye, KeyRound, Link2, Search, Table2 } from "@/components/ui/animated-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { DatabaseSchema, TableSchema } from "@/lib/types"

interface WorkspaceSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schema: DatabaseSchema
  onSelectTable: (table: TableSchema) => void
}

export function WorkspaceSearchDialog({ open, onOpenChange, schema, onSelectTable }: WorkspaceSearchDialogProps) {
  const [query, setQuery] = useState("")
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return schema.tables.filter((table) => {
      if (!needle) return true
      return `${table.schema}.${table.name}`.toLowerCase().includes(needle) || table.columns.some((column) => column.name.toLowerCase().includes(needle))
    }).slice(0, 50)
  }, [query, schema.tables])

  const choose = (table: TableSchema) => {
    onSelectTable(table)
    onOpenChange(false)
  }

  return <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setQuery("") }}>
    <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
      <DialogHeader className="sr-only"><DialogTitle>Search workspace</DialogTitle><DialogDescription>Find tables, views, and columns in the active schema.</DialogDescription></DialogHeader>
      <div className="border-b border-border p-3">
        <InputGroup className="h-10 border-0 bg-transparent shadow-none"><InputGroupAddon><Search className="size-4"/></InputGroupAddon><InputGroupInput autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tables, views, and columns…" aria-label="Search tables, views, and columns" className="text-sm" /></InputGroup>
      </div>
      <ScrollArea className="max-h-[420px] min-h-56">
        {results.length ? <div className="p-2">{results.map((table) => {
          const matchingColumns = query.trim() ? table.columns.filter((column) => column.name.toLowerCase().includes(query.trim().toLowerCase())) : []
          return <Button key={`${table.schema}.${table.name}`} variant="ghost" className="h-auto w-full justify-start gap-3 px-3 py-2.5 text-left font-normal" onClick={() => choose(table)}>
            <span className="grid size-8 place-items-center border-l-2 border-primary bg-card">{table.kind === "view" ? <Eye className="size-3.5 text-relationship"/> : <Table2 className="size-3.5 text-primary"/>}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{table.name}</span><span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{table.schema} · {table.columns.length} columns{matchingColumns.length ? ` · ${matchingColumns.map((column) => column.name).join(", ")}` : ""}</span></span>
            <Badge variant="outline">{table.kind.toUpperCase()}</Badge>
          </Button>
        })}</div> : <Empty className="min-h-56"><EmptyHeader><EmptyMedia><Search className="size-4"/></EmptyMedia><EmptyTitle>No schema matches</EmptyTitle><EmptyDescription>Try a table, schema, or column name.</EmptyDescription></EmptyHeader></Empty>}
      </ScrollArea>
      <div className="flex h-9 items-center gap-4 border-t border-border bg-muted/20 px-4 font-mono text-[8px] uppercase tracking-[0.08em] text-muted-foreground"><span className="flex items-center gap-1"><KeyRound className="size-3"/>Searches columns too</span><span className="ml-auto flex items-center gap-1"><Link2 className="size-3"/>{schema.tables.reduce((total, table) => total + table.foreignKeys.length, 0)} relationships</span></div>
    </DialogContent>
  </Dialog>
}
