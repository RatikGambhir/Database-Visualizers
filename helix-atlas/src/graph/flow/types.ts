import type { Edge, Node } from "@xyflow/react";

export type EntityNodeData = {
  label: string | null;
  caption: string;
  degree: number;
  properties: Record<string, unknown>;
  colour: string;
};

export type RelationshipEdgeData = {
  label: string | null;
  parallelIndex: number;
  parallelCount: number;
  loop: boolean;
};

export type EntityNode = Node<EntityNodeData, "entity">;
export type RelationshipEdge = Edge<RelationshipEdgeData, "relationship">;
