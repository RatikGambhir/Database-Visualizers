import { useCallback, useEffect, useMemo } from "react"
import { Background, BackgroundVariant, MarkerType, MiniMap, Panel, ReactFlow, useEdgesState, useNodesState, useReactFlow, useViewport, type Edge, type NodeMouseHandler } from "@xyflow/react"
import { Focus, LayoutGrid, Minus, Plus, Waypoints } from "@/components/ui/animated-icons"
import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DatabaseSchema, TableSchema } from "@/lib/types"
import { TableNode, type TableGraphNode } from "./TableNode"
import "@xyflow/react/dist/style.css"

const nodeTypes = { tableNode: TableNode }

interface SchemaGraphProps {
  schema: DatabaseSchema
  selectedTable: string | null
  onSelectTable: (table: TableSchema) => void
  onOpenTable?: (table: TableSchema) => void
}

function GraphToolbar({ onResetLayout }: { onResetLayout: () => void }) {
  const flow = useReactFlow()
  const { zoom } = useViewport()
  const resetAndFit = () => {
    onResetLayout()
    requestAnimationFrame(() => void flow.fitView({ padding: 0.2, maxZoom: 1, duration: 240 }))
  }
  return <Card className="flex items-center gap-1 bg-popover/92 p-1 shadow-xl shadow-black/5 backdrop-blur-md">
    <ButtonGroup>
      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Zoom out" onClick={() => void flow.zoomOut()}><Minus /></Button></TooltipTrigger><TooltipContent>Zoom out</TooltipContent></Tooltip>
      <ButtonGroupText className="w-11 select-none border-0 bg-transparent px-1 text-[9px] tabular-nums">{Math.round(zoom * 100)}%</ButtonGroupText>
      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Fit diagram" onClick={() => void flow.fitView({ padding: 0.18, duration: 240 })}><Focus /></Button></TooltipTrigger><TooltipContent>Fit diagram</TooltipContent></Tooltip>
      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Zoom in" onClick={() => void flow.zoomIn()}><Plus /></Button></TooltipTrigger><TooltipContent>Zoom in</TooltipContent></Tooltip>
    </ButtonGroup>
    <Separator orientation="vertical" className="mx-1 h-4" />
    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Reset table layout" onClick={resetAndFit}><LayoutGrid /></Button></TooltipTrigger><TooltipContent>Reset table layout</TooltipContent></Tooltip>
  </Card>
}

export function SchemaGraph({ schema, selectedTable, onSelectTable, onOpenTable }: SchemaGraphProps) {
  const initialGraph = useMemo(() => buildGraph(schema, selectedTable, onOpenTable), [onOpenTable, schema, selectedTable])
  const [nodes, setNodes, onNodesChange] = useNodesState<TableGraphNode>(initialGraph.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialGraph.edges)
  const onNodeClick: NodeMouseHandler<TableGraphNode> = (_, node) => onSelectTable(node.data.table)
  const onNodeDoubleClick: NodeMouseHandler<TableGraphNode> = (_, node) => onOpenTable?.(node.data.table)

  useEffect(() => {
    const nextGraph = buildGraph(schema, selectedTable, onOpenTable)
    setNodes((currentNodes) => {
      const positions = new Map(currentNodes.map((node) => [node.id, node.position]))
      return nextGraph.nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }))
    })
    setEdges(nextGraph.edges)
  }, [onOpenTable, schema, selectedTable, setEdges, setNodes])

  const resetLayout = useCallback(() => {
    const nextGraph = buildGraph(schema, selectedTable, onOpenTable)
    setNodes(nextGraph.nodes)
    setEdges(nextGraph.edges)
  }, [onOpenTable, schema, selectedTable, setEdges, setNodes])

  return <div className="relative h-full min-h-0 bg-canvas">
    <ReactFlow<TableGraphNode, Edge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      onNodeDoubleClick={onNodeDoubleClick}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      minZoom={0.25}
      maxZoom={1.8}
      snapToGrid
      snapGrid={[12, 12]}
      nodesDraggable
      nodesConnectable={false}
      edgesFocusable
      elementsSelectable
      deleteKeyCode={null}
      panOnScroll
      selectionOnDrag
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1.1} color="var(--canvas-dot)" />
      <Panel position="top-left" className="!m-4">
        <Card className="pointer-events-none flex items-center gap-2.5 border-border/70 bg-popover/82 px-3 py-2 shadow-lg shadow-black/5 backdrop-blur-md">
          <span className="grid size-7 place-items-center rounded-lg border border-primary/20 bg-primary/8 text-primary"><Waypoints className="size-3.5" /></span>
          <div>
            <p className="text-[11px] font-semibold">Schema map</p>
            <p className="text-[9px] text-muted-foreground">{schema.tables.length} objects · drag to arrange · double-click to browse</p>
          </div>
        </Card>
      </Panel>
      <MiniMap
        className="!bottom-4 !right-4 !h-28 !w-40 !rounded-xl !border !border-border/80 !bg-popover/88 !shadow-xl"
        nodeColor={(node) => node.data.selected ? "var(--primary)" : node.data.related ? "var(--edge)" : "var(--muted)"}
        nodeStrokeColor="var(--border)"
        maskColor="color-mix(in oklab, var(--background) 70%, transparent)"
        pannable
        zoomable
      />
      <Panel position="bottom-left" className="!bottom-4 !left-4 !m-0"><GraphToolbar onResetLayout={resetLayout} /></Panel>
    </ReactFlow>
  </div>
}

function buildGraph(schema: DatabaseSchema, selectedTable: string | null, onOpenTable?: (table: TableSchema) => void) {
  const columns = Math.max(2, Math.ceil(Math.sqrt(schema.tables.length)))
  const ids = new Set(schema.tables.map((table) => `${table.schema}.${table.name}`))
  const relations = schema.tables.flatMap((table) => table.foreignKeys.flatMap((foreignKey, index) => {
    const source = `${table.schema}.${table.name}`
    const target = `${foreignKey.toSchema ?? table.schema}.${foreignKey.toTable}`
    if (!ids.has(target)) return []
    return [{ id: `${source}-${foreignKey.name}-${index}`, source, target, sourceHandle: `${foreignKey.fromColumn}-source`, targetHandle: `${foreignKey.toColumn}-target` }]
  }))
  const relatedIds = new Set(relations.flatMap((edge) => edge.source === selectedTable || edge.target === selectedTable ? [edge.source, edge.target] : []))
  const rowOffsets: number[] = []
  for (let row = 0; row * columns < schema.tables.length; row += 1) {
    const previousOffset = rowOffsets[row - 1] ?? 56
    const previousTables = schema.tables.slice(Math.max(0, (row - 1) * columns), row * columns)
    const previousHeight = Math.max(0, ...previousTables.map((table) => 62 + table.columns.length * 28))
    rowOffsets[row] = row === 0 ? 56 : previousOffset + previousHeight + 96
  }
  const nodes: TableGraphNode[] = schema.tables.map((table, index) => {
    const id = `${table.schema}.${table.name}`
    const isSelected = selectedTable === id
    return {
      id,
      type: "tableNode",
      position: { x: 72 + (index % columns) * 364, y: rowOffsets[Math.floor(index / columns)] },
      dragHandle: ".table-node-drag-handle",
      ariaLabel: `${table.schema}.${table.name} table. Selectable and draggable.`,
      selected: isSelected,
      zIndex: isSelected ? 3 : relatedIds.has(id) ? 2 : 1,
      data: { table, selected: isSelected, related: !isSelected && relatedIds.has(id), dimmed: Boolean(selectedTable) && !isSelected && !relatedIds.has(id), onOpen: onOpenTable },
    }
  })
  const edges: Edge[] = relations.map((relation) => {
    const highlighted = relation.source === selectedTable || relation.target === selectedTable
    const color = highlighted ? "var(--relationship)" : "var(--edge)"
    return {
      ...relation,
      type: "smoothstep",
      animated: highlighted,
      zIndex: highlighted ? 2 : 0,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
      style: { stroke: color, strokeWidth: highlighted ? 2 : 1.2, opacity: selectedTable && !highlighted ? 0.32 : 0.82 },
    }
  })
  return { nodes, edges }
}
