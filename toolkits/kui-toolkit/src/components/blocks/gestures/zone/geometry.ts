import type { EdgeStrips } from '../../environment';

export type Rect = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

/**
 * The part of an element where the app owns touch input: its bounds minus
 * the viewport's edge strips. Strips are measured from the viewport, because
 * that is where the browser and OS look for edge swipes.
 */
export const zoneRect = (
  bounds: Rect,
  viewportWidth: number,
  strips: EdgeStrips,
): Rect => {
  const left = Math.max(bounds.left, strips.left.width);
  const right = Math.min(bounds.right, viewportWidth - strips.right.width);
  return {
    left,
    top: bounds.top,
    right: Math.max(left, right),
    bottom: bounds.bottom,
  };
};

export const contains = (rect: Rect, x: number, y: number): boolean =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
