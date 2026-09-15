import { memo } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { Eye, KeyRound, Link2, Table2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { TableSchema } from "@/lib/types"
import { cn } from "@/lib/utils"

export type TableGraphNode = Node<{ table: TableSchema; selected: boolean }, "tableNode">

function TableNodeComponent({ data }: NodeProps<TableGraphNode>) {
  const foreignColumns = new Set(data.table.foreignKeys.map((key) => key.fromColumn))
  return (
    <div className={cn("w-[254px] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl shadow-black/15 transition-[border-color,box-shadow]", data.selected && "border-primary/70 shadow-primary/10 ring-1 ring-primary/35")}>
      <div className="flex h-10 items-center gap-2 border-b border-border bg-muted/30 px-3">
        {data.table.kind === "view" ? <Eye className="size-3.5 text-sky-400"/> : <Table2 className="size-3.5 text-primary"/>}
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{data.table.name}</p><p className="truncate font-mono text-[9px] text-muted-foreground">{data.table.schema}</p></div>
        {data.table.rowCount != null ? <Badge variant="outline" className="font-mono">{new Intl.NumberFormat("en", { notation: "compact" }).format(data.table.rowCount)}</Badge> : <Badge variant="secondary">VIEW</Badge>}
      </div>
      <div className="py-1">
        {data.table.columns.map((column) => <div key={column.name} className="relative flex h-7 items-center gap-2 px-3 hover:bg-muted/35">
          <Handle type="target" position={Position.Left} id={`${column.name}-target`} className="!size-1.5 !border-0 !bg-border !opacity-0" />
          <span className="grid size-3.5 place-items-center">{column.primaryKey ? <KeyRound className="size-3 text-amber-400"/> : foreignColumns.has(column.name) ? <Link2 className="size-3 text-sky-400"/> : <span className="size-1 rounded-full bg-muted-foreground/45"/>}</span>
          <span className={cn("min-w-0 flex-1 truncate font-mono text-[10px]", column.primaryKey && "font-semibold text-foreground")}>{column.name}</span>
          <span className="max-w-24 truncate font-mono text-[9px] text-muted-foreground">{column.dataType}</span>
          {column.nullable ? <span className="font-mono text-[8px] text-muted-foreground/55">?</span> : null}
          <Handle type="source" position={Position.Right} id={`${column.name}-source`} className="!size-1.5 !border-0 !bg-primary !opacity-0" />
        </div>)}
      </div>
    </div>
  )
}

export const TableNode = memo(TableNodeComponent)
