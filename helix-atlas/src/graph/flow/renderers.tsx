import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react";
import type { EntityNode, RelationshipEdge } from "./types";

export function EntityNodeCard({ data, selected }: NodeProps<EntityNode>) {
  const propertyCount = Object.keys(data.properties).length;
  const description = [
    data.label ?? "Unlabelled node",
    data.caption,
    `${data.degree} relationship${data.degree === 1 ? "" : "s"}`,
    `${propertyCount} propert${propertyCount === 1 ? "y" : "ies"}`,
  ].join(" · ");

  return (
    <div
      className={`entity-node${selected ? " is-selected" : ""}`}
      style={{ "--node-colour": data.colour } as React.CSSProperties}
      title={description}
    >
      <span className="entity-node-accent" aria-hidden="true" />
      <div className="entity-node-copy">
        <span className="entity-node-caption">{data.caption}</span>
        <span className="entity-node-meta">
          {data.label ?? "Unlabelled"} <span aria-hidden="true">·</span>{" "}
          {data.degree}
        </span>
      </div>
      <span className="entity-node-port" aria-hidden="true" />
      {(
        [Position.Top, Position.Right, Position.Bottom, Position.Left] as const
      ).flatMap((position) => {
        const side = position.toLowerCase();
        return [
          <Handle
            key={`source-${side}`}
            type="source"
            position={position}
            id={`source-${side}`}
            isConnectable={false}
          />,
          <Handle
            key={`target-${side}`}
            type="target"
            position={position}
            id={`target-${side}`}
            isConnectable={false}
          />,
        ];
      })}
    </div>
  );
}

export function RelationshipEdgePath({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  selected,
  data,
  style,
}: EdgeProps<RelationshipEdge>) {
  const parallelIndex = data?.parallelIndex ?? 0;
  const parallelCount = data?.parallelCount ?? 1;
  const centred = parallelIndex - (parallelCount - 1) / 2;
  const offset = centred * 28;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const middleX = (sourceX + targetX) / 2 - (dy / length) * offset;
  const middleY = (sourceY + targetY) / 2 + (dx / length) * offset;
  const isLoop = data?.loop || source === target;
  const path = isLoop
    ? `M ${sourceX} ${sourceY} C ${sourceX + 84} ${sourceY - 92}, ${targetX - 84} ${targetY - 92}, ${targetX} ${targetY}`
    : `M ${sourceX} ${sourceY} Q ${middleX} ${middleY} ${targetX} ${targetY}`;
  const labelX = isLoop
    ? (sourceX + targetX) / 2
    : (sourceX + 2 * middleX + targetX) / 4;
  const labelY = isLoop
    ? Math.min(sourceY, targetY) - 70
    : (sourceY + 2 * middleY + targetY) / 4;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={18}
        style={style}
        className={selected ? "is-selected" : undefined}
      />
      {selected && data?.label ? (
        <EdgeLabelRenderer>
          <div
            className="edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
