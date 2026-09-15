import { memo } from "react"
import { Handle, NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react"
import { ArrowUpRight, Eye, KeyRound, Link2, Rows3, Table2 } from "@/components/ui/animated-icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import type { TableSchema } from "@/lib/types"
import { cn } from "@/lib/utils"

export type TableGraphNode = Node<{
  table: TableSchema
  selected: boolean
  related: boolean
  dimmed: boolean
  onOpen?: (table: TableSchema) => void
}, "tableNode">

function TableNodeComponent({ data }: NodeProps<TableGraphNode>) {
  const foreignColumns = new Set(data.table.foreignKeys.map((key) => key.fromColumn))
  return (
    <>
      <NodeToolbar isVisible={data.selected && Boolean(data.onOpen)} position={Position.Top} align="end" offset={10}>
        <Button
          variant="outline"
          size="sm"
          className="nodrag nopan h-7 gap-1.5 border-border/80 bg-popover/95 px-2 text-[10px] shadow-lg backdrop-blur"
          onClick={(event) => {
            event.stopPropagation()
            data.onOpen?.(data.table)
          }}
        >
          <Rows3 className="size-3" />
          Browse rows
          <ArrowUpRight className="size-3 text-muted-foreground" />
        </Button>
      </NodeToolbar>
      <Card asChild className={cn(
        "table-node w-[276px] overflow-hidden border-border/90 bg-card/98 shadow-[0_12px_32px_-18px_rgb(0_0_0/0.42)] transition-[border-color,box-shadow,opacity,transform] duration-150",
        data.related && "border-primary/35 shadow-[0_16px_38px_-20px_color-mix(in_oklab,var(--primary)_35%,transparent)]",
        data.dimmed && "opacity-70",
        data.selected && "border-primary/75 shadow-[0_18px_44px_-20px_color-mix(in_oklab,var(--primary)_55%,transparent)] ring-1 ring-primary/25",
      )}>
      <article aria-label={`${data.table.schema}.${data.table.name} ${data.table.kind}`}>
      <CardHeader className="table-node-drag-handle flex h-11 cursor-grab grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border/80 bg-muted/25 px-3 py-0 active:cursor-grabbing">
        {data.table.kind === "view" ? <Eye className="size-3.5 text-relationship"/> : <Table2 className="size-3.5 text-primary"/>}
        <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold tracking-[-0.01em]">{data.table.name}</p><p className="truncate text-[9px] text-muted-foreground">{data.table.schema}</p></div>
        {data.table.rowCount != null ? <Badge variant="outline">{new Intl.NumberFormat("en", { notation: "compact" }).format(data.table.rowCount)}</Badge> : <Badge variant="secondary">VIEW</Badge>}
      </CardHeader>
      <CardContent className="py-1.5 px-0">
        {data.table.columns.map((column) => <div key={column.name} className="table-node-row relative flex h-7 items-center gap-2 px-3 transition-colors hover:bg-muted/40">
          <Handle type="target" position={Position.Left} id={`${column.name}-target`} className="table-node-handle !size-2 !border-2 !border-card !bg-muted-foreground/45" />
          <span className="grid size-3.5 place-items-center">{column.primaryKey ? <KeyRound className="size-3 text-primary"/> : foreignColumns.has(column.name) ? <Link2 className="size-3 text-relationship"/> : <span className="size-1 rounded-full bg-muted-foreground/45"/>}</span>
          <span className={cn("min-w-0 flex-1 truncate text-[10px] text-foreground/85", column.primaryKey && "font-semibold text-foreground")}>{column.name}</span>
          <span className="max-w-24 truncate text-[9px] text-muted-foreground">{column.dataType}</span>
          {column.nullable ? <span className="text-[8px] text-muted-foreground/55">?</span> : null}
          <Handle type="source" position={Position.Right} id={`${column.name}-source`} className="table-node-handle !size-2 !border-2 !border-card !bg-relationship" />
        </div>)}
      </CardContent>
      </article>
      </Card>
    </>
  )
}

export const TableNode = memo(TableNodeComponent)
