import { MarkerType } from "@xyflow/react";
import type { GraphData } from "../../results";
import { ForceLayout } from "../layout";
import type { EntityNode, RelationshipEdge } from "./types";

const CARD_WIDTH = 164;
const CARD_HEIGHT = 52;
const CARD_GAP = 18;

export function buildFlowElements(graph: GraphData): {
  nodes: EntityNode[];
  edges: RelationshipEdge[];
} {
  const layout = new ForceLayout(graph);
  layout.warmUp(150);
  spreadCardNodes(layout.nodes);

  const nodes: EntityNode[] = layout.nodes.map((node) => ({
    id: node.id,
    type: "entity",
    position: { x: node.x, y: node.y },
    data: {
      label: node.label,
      caption: nodeCaption(node.properties, node.label, node.id),
      degree: node.degree,
      properties: node.properties,
      colour: "currentColor",
    },
    ariaLabel: `${node.label ?? "Unlabelled node"}: ${nodeCaption(node.properties, node.label, node.id)}`,
  }));

  const positions = new Map(layout.nodes.map((node) => [node.id, node]));
  const edges: RelationshipEdge[] = layout.edges.map((edge) => {
    const source = positions.get(edge.source.id)!;
    const target = positions.get(edge.target.id)!;
    const handles = edge.loop
      ? { sourceHandle: "source-right", targetHandle: "target-top" }
      : handlesFor(source.x, source.y, target.x, target.y);
    return {
      id: edge.id,
      type: "relationship",
      source: edge.source.id,
      target: edge.target.id,
      ...handles,
      data: {
        label: edge.label,
        parallelIndex: edge.parallelIndex,
        parallelCount: edge.parallelCount,
        loop: edge.loop,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      ariaLabel: `${edge.label ?? "Relationship"}: ${edge.source.id} to ${edge.target.id}`,
    };
  });

  return { nodes, edges };
}

/**
 * The force engine was originally tuned for circular canvas marks. React Flow
 * renders information-rich cards, so resolve their rectangular bounds before
 * handing the positions over. This keeps the topology organic without leaving
 * labels stacked on top of each other.
 */
function spreadCardNodes(
  nodes: Array<{ id: string; x: number; y: number }>,
): void {
  for (const node of nodes) {
    node.x *= 1.35;
    node.y *= 1.15;
  }

  const minimumX = CARD_WIDTH + CARD_GAP;
  const minimumY = CARD_HEIGHT + CARD_GAP;
  const passes = nodes.length > 800 ? 8 : 22;

  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      for (
        let otherIndex = index + 1;
        otherIndex < nodes.length;
        otherIndex++
      ) {
        const other = nodes[otherIndex];
        const dx = other.x - node.x;
        const dy = other.y - node.y;
        const overlapX = minimumX - Math.abs(dx);
        const overlapY = minimumY - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        moved = true;
        if (overlapX < overlapY) {
          const direction =
            dx === 0 ? (node.id < other.id ? 1 : -1) : Math.sign(dx);
          const shift = overlapX / 2 + 0.5;
          node.x -= direction * shift;
          other.x += direction * shift;
        } else {
          const direction =
            dy === 0 ? (node.id < other.id ? 1 : -1) : Math.sign(dy);
          const shift = overlapY / 2 + 0.5;
          node.y -= direction * shift;
          other.y += direction * shift;
        }
      }
    }
    if (!moved) break;
  }
}

function handlesFor(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
) {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "source-right", targetHandle: "target-left" }
      : { sourceHandle: "source-left", targetHandle: "target-right" };
  }
  return dy >= 0
    ? { sourceHandle: "source-bottom", targetHandle: "target-top" }
    : { sourceHandle: "source-top", targetHandle: "target-bottom" };
}

function nodeCaption(
  properties: Record<string, unknown>,
  label: string | null,
  id: string,
): string {
  for (const key of ["name", "title", "label", "username", "email"]) {
    const value = properties[key];
    if (typeof value === "string" && value.length > 0)
      return truncate(value, 28);
    if (typeof value === "number" || typeof value === "bigint")
      return String(value);
  }
  return label ? `${label} ${truncate(id, 16)}` : truncate(id, 22);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
