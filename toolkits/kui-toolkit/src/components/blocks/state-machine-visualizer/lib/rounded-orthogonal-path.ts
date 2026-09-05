import type { StateMachinePoint } from '../types';

export function roundedOrthogonalPath(
  points: readonly StateMachinePoint[],
): string {
  const distinctPoints = points.filter(
    (point, index) =>
      index === 0 ||
      point.x !== points[index - 1].x ||
      point.y !== points[index - 1].y,
  );

  if (distinctPoints.length === 0) return '';
  if (distinctPoints.length === 1) {
    return `M ${distinctPoints[0].x} ${distinctPoints[0].y}`;
  }

  const path = [`M ${distinctPoints[0].x} ${distinctPoints[0].y}`];

  for (let index = 1; index < distinctPoints.length - 1; index += 1) {
    const previous = distinctPoints[index - 1];
    const current = distinctPoints[index];
    const next = distinctPoints[index + 1];
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    const radius = Math.min(6, incoming / 2, outgoing / 2);
    const before = {
      x: current.x + ((previous.x - current.x) / incoming) * radius,
      y: current.y + ((previous.y - current.y) / incoming) * radius,
    };
    const after = {
      x: current.x + ((next.x - current.x) / outgoing) * radius,
      y: current.y + ((next.y - current.y) / outgoing) * radius,
    };

    path.push(
      `L ${before.x} ${before.y}`,
      `Q ${current.x} ${current.y} ${after.x} ${after.y}`,
    );
  }

  const last = distinctPoints.at(-1)!;
  path.push(`L ${last.x} ${last.y}`);
  return path.join(' ');
}
