import type { StateMachinePoint, StateMachineViewport } from '../types';

export interface ViewportBounds {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

export interface ViewportDrag {
  readonly clientX: number;
  readonly clientY: number;
  readonly viewport: StateMachineViewport;
  readonly scale: number;
  moved: boolean;
}

export function getScale(
  bounds: ViewportBounds,
  viewport: StateMachineViewport,
): number {
  return Math.min(
    bounds.width / viewport.width,
    bounds.height / viewport.height,
  );
}

export function toWorldPoint(
  bounds: ViewportBounds,
  viewport: StateMachineViewport,
  clientX: number,
  clientY: number,
): StateMachinePoint {
  const scale = getScale(bounds, viewport);
  const offsetX = (bounds.width - viewport.width * scale) / 2;
  const offsetY = (bounds.height - viewport.height * scale) / 2;

  return {
    x: viewport.x + (clientX - bounds.left - offsetX) / scale,
    y: viewport.y + (clientY - bounds.top - offsetY) / scale,
  };
}

function constrainAxis(
  nextStart: number,
  nextSize: number,
  fitStart: number,
  fitSize: number,
  visibleRatio: number,
): number {
  const overlap = nextSize >= fitSize ? fitSize : nextSize * visibleRatio;
  const minimum = fitStart + overlap - nextSize;
  const maximum = fitStart + fitSize - overlap;
  return Math.min(maximum, Math.max(minimum, nextStart));
}

export function constrainViewport(
  next: StateMachineViewport,
  fit: StateMachineViewport,
  visibleRatio: number,
): StateMachineViewport {
  return {
    ...next,
    x: constrainAxis(next.x, next.width, fit.x, fit.width, visibleRatio),
    y: constrainAxis(next.y, next.height, fit.y, fit.height, visibleRatio),
  };
}

export function centerViewport(
  viewport: StateMachineViewport,
  center: StateMachinePoint,
): StateMachineViewport {
  return {
    ...viewport,
    x: center.x - viewport.width / 2,
    y: center.y - viewport.height / 2,
  };
}

export function interpolateCenter(
  start: StateMachinePoint,
  end: StateMachinePoint,
  progress: number,
): StateMachinePoint {
  const clamped = Math.min(1, Math.max(0, progress));
  const eased = 1 - (1 - clamped) ** 3;
  return {
    x: start.x + (end.x - start.x) * eased,
    y: start.y + (end.y - start.y) * eased,
  };
}

export function getDraggedViewport(
  drag: ViewportDrag,
  pointer: StateMachinePoint,
): StateMachineViewport {
  return {
    ...drag.viewport,
    x: drag.viewport.x - (pointer.x - drag.clientX) / drag.scale,
    y: drag.viewport.y - (pointer.y - drag.clientY) / drag.scale,
  };
}
