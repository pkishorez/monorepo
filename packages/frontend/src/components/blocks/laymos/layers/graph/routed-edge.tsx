import {
  BaseEdge,
  type Edge,
  type EdgeProps,
  type XYPosition,
} from '@xyflow/react';

interface RoutedEdgeData extends Record<string, unknown> {
  readonly points: readonly XYPosition[];
}

export type RoutedGraphEdge = Edge<RoutedEdgeData, 'routed'>;

export function RoutedEdge({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  interactionWidth,
}: EdgeProps<RoutedGraphEdge>) {
  const points =
    data?.points.length === 0
      ? [
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
        ]
      : data?.points;

  return (
    <BaseEdge
      id={id}
      path={roundedPath(points ?? [])}
      markerEnd={markerEnd}
      style={style}
      interactionWidth={interactionWidth}
    />
  );
}

function roundedPath(points: readonly XYPosition[]): string {
  const first = points[0];
  if (first === undefined) return '';
  if (points.length === 1) return `M ${first.x} ${first.y}`;

  const commands = [`M ${first.x} ${first.y}`];
  const radius = 8;

  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const next = points[index + 1]!;
    const before = toward(point, previous, radius);
    const after = toward(point, next, radius);
    commands.push(
      `L ${before.x} ${before.y}`,
      `Q ${point.x} ${point.y} ${after.x} ${after.y}`,
    );
  }

  const last = points.at(-1)!;
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(' ');
}

function toward(
  origin: XYPosition,
  destination: XYPosition,
  maximumDistance: number,
): XYPosition {
  const x = destination.x - origin.x;
  const y = destination.y - origin.y;
  const distance = Math.hypot(x, y);
  if (distance === 0) return origin;
  const ratio = Math.min(maximumDistance, distance / 2) / distance;
  return { x: origin.x + x * ratio, y: origin.y + y * ratio };
}
