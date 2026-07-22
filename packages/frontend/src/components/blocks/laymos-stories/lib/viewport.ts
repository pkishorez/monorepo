import type { Viewport, XYPosition } from '@xyflow/react';

/** Offsets a viewport so an anchor remains at the same screen position. */
export function viewportWithPreservedAnchor(
  viewport: Viewport,
  previousScreenPosition: XYPosition,
  nextScreenPosition: XYPosition,
): Viewport {
  return {
    x: viewport.x + previousScreenPosition.x - nextScreenPosition.x,
    y: viewport.y + previousScreenPosition.y - nextScreenPosition.y,
    zoom: viewport.zoom,
  };
}
