import { useMemo } from "react"
import { Background, BackgroundVariant, MarkerType, MiniMap, ReactFlow, useReactFlow, type Edge, type NodeMouseHandler } from "@xyflow/react"
import { Focus, Minus, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DatabaseSchema, TableSchema } from "@/lib/types"
import { TableNode, type TableGraphNode } from "./TableNode"
import "@xyflow/react/dist/style.css"

const nodeTypes = { tableNode: TableNode }

interface SchemaGraphProps {
  schema: DatabaseSchema
  selectedTable: string | null
  onSelectTable: (table: TableSchema) => void
}

function GraphToolbar() {
  const flow = useReactFlow()
  return <div className="absolute bottom-4 left-4 z-10 flex items-center rounded-lg border border-border bg-popover/95 p-1 shadow-xl backdrop-blur">
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => void flow.zoomOut()}><Minus /></Button></TooltipTrigger><TooltipContent>Zoom out</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Fit diagram" onClick={() => void flow.fitView({ padding: 0.18, duration: 240 })}><Focus /></Button></TooltipTrigger><TooltipContent>Fit diagram</TooltipContent></Tooltip>
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => void flow.zoomIn()}><Plus /></Button></TooltipTrigger><TooltipContent>Zoom in</TooltipContent></Tooltip>
  </div>
}

export function SchemaGraph({ schema, selectedTable, onSelectTable }: SchemaGraphProps) {
  const { nodes, edges } = useMemo(() => buildGraph(schema, selectedTable), [schema, selectedTable])
  const onNodeClick: NodeMouseHandler<TableGraphNode> = (_, node) => onSelectTable(node.data.table)

  return <div className="relative h-full min-h-0 bg-canvas">
    <ReactFlow<TableGraphNode, Edge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={onNodeClick} fitView fitViewOptions={{ padding: 0.17 }} minZoom={0.22} maxZoom={1.7} nodesDraggable nodesConnectable={false} elementsSelectable>
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--canvas-dot)" />
      <MiniMap className="!bottom-4 !right-4 !h-28 !w-40 !rounded-lg !border !border-border !bg-popover/90 !shadow-xl" nodeColor="var(--muted)" maskColor="color-mix(in oklab, var(--background) 72%, transparent)" pannable zoomable />
      <GraphToolbar />
    </ReactFlow>
  </div>
}

function buildGraph(schema: DatabaseSchema, selectedTable: string | null) {
  const columns = Math.max(2, Math.ceil(Math.sqrt(schema.tables.length)))
  const nodes: TableGraphNode[] = schema.tables.map((table, index) => ({
    id: `${table.schema}.${table.name}`,
    type: "tableNode",
    position: { x: 80 + (index % columns) * 340, y: 60 + Math.floor(index / columns) * 300 + (index % 2) * 36 },
    data: { table, selected: selectedTable === `${table.schema}.${table.name}` },
  }))
  const ids = new Set(nodes.map((node) => node.id))
  const edges: Edge[] = schema.tables.flatMap((table) => table.foreignKeys.flatMap((foreignKey, index) => {
    const source = `${table.schema}.${table.name}`
    const target = `${foreignKey.toSchema ?? table.schema}.${foreignKey.toTable}`
    if (!ids.has(target)) return []
    return [{ id: `${source}-${foreignKey.name}-${index}`, source, target, sourceHandle: `${foreignKey.fromColumn}-source`, targetHandle: `${foreignKey.toColumn}-target`, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13, color: "var(--edge)" }, style: { stroke: "var(--edge)", strokeWidth: 1.25 } }]
  }))
  return { nodes, edges }
}
