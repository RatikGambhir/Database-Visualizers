import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import type { GraphData } from "../results";
import { buildFlowElements } from "./flow/elements";
import { EntityNodeCard, RelationshipEdgePath } from "./flow/renderers";
import type {
  EntityNodeData,
  EntityNode,
  RelationshipEdge,
} from "./flow/types";
import { LabelPalette, legendColour, type Theme } from "./palette";

export interface GraphSelectionEvent {
  kind: "node" | "edge";
  id: string;
  label: string | null;
}

interface Props {
  graph: GraphData;
  theme: Theme;
  selectedId: string | null;
  onSelect: (selection: GraphSelectionEvent | null) => void;
  /** Double-click asks the app to expand a node's neighbourhood. */
  onExpand: (nodeId: string) => void;
}

const NODE_TYPES = { entity: EntityNodeCard };
const EDGE_TYPES = { relationship: RelationshipEdgePath };
const NODE_ORIGIN: [number, number] = [0.5, 0.5];
export function GraphCanvas({
  graph,
  theme,
  selectedId,
  onSelect,
  onExpand,
}: Props) {
  const palette = useMemo(
    () => new LabelPalette(graph.nodes.map((node) => node.label)),
    [graph],
  );
  const initial = useMemo(() => buildFlowElements(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNode>(
    initial.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<RelationshipEdge>(
    initial.edges,
  );
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const flowRef = useRef<ReactFlowInstance<
    EntityNode,
    RelationshipEdge
  > | null>(null);

  const adjacency = useMemo(() => {
    const next = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      if (!next.has(edge.source)) next.set(edge.source, new Set());
      if (!next.has(edge.target)) next.set(edge.target, new Set());
      next.get(edge.source)!.add(edge.target);
      next.get(edge.target)!.add(edge.source);
    }
    return next;
  }, [graph.edges]);

  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
    setHoveredNodeId(null);
    requestAnimationFrame(() =>
      flowRef.current?.fitView({ padding: 0.2, duration: 300 }),
    );
  }, [initial, setEdges, setNodes]);

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({ ...node, selected: node.id === selectedId })),
    );
    setEdges((current) =>
      current.map((edge) => ({ ...edge, selected: edge.id === selectedId })),
    );
  }, [selectedId, setEdges, setNodes]);

  const focusId =
    hoveredNodeId ??
    (nodes.some((node) => node.id === selectedId) ? selectedId : null);
  const visibleNodeIds = useMemo(() => {
    if (!focusId) return null;
    return new Set([focusId, ...(adjacency.get(focusId) ?? [])]);
  }, [adjacency, focusId]);

  const displayNodes = useMemo(
    () =>
      nodes.map((node) => {
        const colour = palette.colour(node.data.label, theme);
        const labelMuted =
          hoveredLabel !== null && node.data.label !== hoveredLabel;
        const neighbourhoodMuted =
          visibleNodeIds !== null && !visibleNodeIds.has(node.id);
        return {
          ...node,
          className: labelMuted || neighbourhoodMuted ? "is-dimmed" : undefined,
          data: { ...node.data, colour },
        };
      }),
    [hoveredLabel, nodes, palette, theme, visibleNodeIds],
  );

  const displayEdges = useMemo(
    () =>
      edges.map((edge) => {
        const sourceLabel = nodes.find((node) => node.id === edge.source)?.data
          .label;
        const targetLabel = nodes.find((node) => node.id === edge.target)?.data
          .label;
        const labelMuted =
          hoveredLabel !== null &&
          sourceLabel !== hoveredLabel &&
          targetLabel !== hoveredLabel;
        const neighbourhoodMuted =
          focusId !== null &&
          edge.source !== focusId &&
          edge.target !== focusId;
        return {
          ...edge,
          className: labelMuted || neighbourhoodMuted ? "is-dimmed" : undefined,
        };
      }),
    [edges, focusId, hoveredLabel, nodes],
  );

  const restoreLayout = useCallback(() => {
    const next = buildFlowElements(graph);
    setNodes(next.nodes);
    setEdges(next.edges);
    requestAnimationFrame(() =>
      flowRef.current?.fitView({ padding: 0.2, duration: 300 }),
    );
  }, [graph, setEdges, setNodes]);

  return (
    <div className="graph-canvas">
      <ReactFlow<EntityNode, RelationshipEdge>
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodeOrigin={NODE_ORIGIN}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => {
          flowRef.current = instance;
        }}
        onNodeClick={(_event, node) =>
          onSelect({ kind: "node", id: node.id, label: node.data.label })
        }
        onNodeDoubleClick={(_event, node) => onExpand(node.id)}
        onNodeMouseEnter={(_event, node) => setHoveredNodeId(node.id)}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        onEdgeClick={(_event, edge) =>
          onSelect({
            kind: "edge",
            id: edge.id,
            label: edge.data?.label ?? null,
          })
        }
        onPaneClick={() => onSelect(null)}
        nodesDraggable
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable
        panOnDrag={[0, 1]}
        minZoom={0.08}
        maxZoom={3.5}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.35 }}
        colorMode={theme}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        aria-label="Interactive graph visualization"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        <Controls position="top-right" showInteractive={false}>
          <ControlButton
            onClick={restoreLayout}
            title="Reset node layout"
            aria-label="Reset node layout"
          >
            <ResetIcon />
          </ControlButton>
        </Controls>
        {graph.nodes.length <= 500 ? (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(node) => (node.data as EntityNodeData).colour}
            nodeStrokeWidth={2}
            ariaLabel="Graph minimap"
          />
        ) : null}
        <Panel position="bottom-left" className="graph-legend-panel">
          <div className="graph-legend-heading">
            <span>Node labels</span>
            <span>{graph.nodes.length.toLocaleString()} total</span>
          </div>
          <ul className="graph-legend" aria-label="Node labels">
            {palette.legend.map((entry) => (
              <li key={`${entry.slot ?? "other"}-${entry.label}`}>
                <Button
                  variant="ghost"
                  onMouseEnter={() =>
                    setHoveredLabel(entry.slot === null ? null : entry.label)
                  }
                  onMouseLeave={() => setHoveredLabel(null)}
                  onFocus={() =>
                    setHoveredLabel(entry.slot === null ? null : entry.label)
                  }
                  onBlur={() => setHoveredLabel(null)}
                >
                  <span
                    className="swatch"
                    style={{ background: legendColour(entry, theme) }}
                    aria-hidden="true"
                  />
                  <span className="legend-label">{entry.label}</span>
                  <span className="legend-count">
                    {entry.count.toLocaleString()}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel position="top-left" className="graph-help">
          Drag nodes · scroll to zoom · drag canvas to pan · shift-drag to
          select
        </Panel>
      </ReactFlow>
    </div>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.8 7.7A8 8 0 1 1 4 14M4.8 7.7V3.5m0 4.2H9" />
    </svg>
  );
}
