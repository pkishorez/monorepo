import type { Point, Rect, Size } from '../mind-map/mind-map-layout';

/** Where the space sits on screen: screen = world × zoom + (x, y). */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const zoomLimits = { min: 0.25, max: 2 } as const;

/** The most of the cards' bounds, per axis, that may be panned off screen. */
export const maxHiddenShare = 0.8;

export function clampZoom(zoom: number): number {
  return Math.min(zoomLimits.max, Math.max(zoomLimits.min, zoom));
}

function clampAxis(
  position: number,
  start: number,
  length: number,
  zoom: number,
  viewport: number,
): number {
  const extent = length * zoom;
  // What must stay on screen: a share of the content, or of the screen when
  // the content is smaller; never more than the content or the screen holds.
  const shown = Math.min(
    extent,
    viewport,
    (1 - maxHiddenShare) * Math.max(extent, viewport),
  );
  // Positions where the content's far edge, then its near edge, keep `shown`.
  const low = shown - extent - start * zoom;
  const high = viewport - shown - start * zoom;
  return Math.min(high, Math.max(low, position));
}

/**
 * Keeps the space bounded: on each axis, no more than `maxHiddenShare` of
 * the cards' bounds leaves the screen.
 */
export function clampCamera(
  camera: Camera,
  content: Rect,
  viewport: Size,
): Camera {
  const zoom = clampZoom(camera.zoom);
  return {
    zoom,
    x: clampAxis(camera.x, content.x, content.width, zoom, viewport.width),
    y: clampAxis(camera.y, content.y, content.height, zoom, viewport.height),
  };
}

/** The world rect the camera shows. */
export function visibleRect(camera: Camera, viewport: Size): Rect {
  return {
    x: -camera.x / camera.zoom,
    y: -camera.y / camera.zoom,
    width: viewport.width / camera.zoom,
    height: viewport.height / camera.zoom,
  };
}

/** How far down the screen, as a share of its height, a framed rect centres. */
export const frameHeight = 0.4;

/**
 * Pans, at the same zoom, to frame `rect`: centred across the screen, its
 * middle `frameHeight` of the way down. A rect too big for that keeps its
 * left or top `margin` from the screen's edge, unless it fits the screen:
 * then it is centred, with equal room on both sides.
 */
export function frameRect(
  camera: Camera,
  rect: Rect,
  viewport: Size,
  margin = 48,
): Camera {
  const { zoom } = camera;
  const width = rect.width * zoom;
  const height = rect.height * zoom;
  const left = width <= viewport.width ? (viewport.width - width) / 2 : margin;
  const top = Math.max(margin, viewport.height * frameHeight - height / 2);
  return { zoom, x: left - rect.x * zoom, y: top - rect.y * zoom };
}

/** Room, in screen px, a focused card keeps from every edge of the screen. */
export const focusPadding = 100;
/** The share of the way to the centre a card brought into view moves on. */
export const nudgeTowardCentre = 0.25;

/**
 * Brings `rect` inside the screen less `padding` on every side, at the same
 * zoom: an axis already inside stays put; one outside moves just enough to
 * bring it in, then `nudge` of the rest of the way to the framing centre, so
 * the next move has room. A rect too big for the room keeps its left or top
 * edge `padding` from the screen's.
 */
export function nudgeIntoView(
  camera: Camera,
  rect: Rect,
  viewport: Size,
  padding = focusPadding,
  nudge = nudgeTowardCentre,
): Camera {
  const axis = (
    position: number,
    start: number,
    length: number,
    size: number,
    centre: number,
  ) => {
    const near = start * camera.zoom + position;
    const extent = length * camera.zoom;
    if (extent > size - padding * 2)
      return extent <= size
        ? position + (size - extent) / 2 - near
        : position + padding - near;
    const shift =
      near < padding
        ? padding - near
        : near + extent > size - padding
          ? size - padding - (near + extent)
          : 0;
    if (shift === 0) return position;
    const left = centre - (near + shift + extent / 2);
    return position + shift + left * nudge;
  };
  return {
    zoom: camera.zoom,
    x: axis(camera.x, rect.x, rect.width, viewport.width, viewport.width / 2),
    y: axis(
      camera.y,
      rect.y,
      rect.height,
      viewport.height,
      viewport.height * frameHeight,
    ),
  };
}

/** Zooms by `factor` keeping the world point under `screen` where it is. */
export function zoomAt(camera: Camera, screen: Point, factor: number): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  const ratio = zoom / camera.zoom;
  return {
    zoom,
    x: screen.x - (screen.x - camera.x) * ratio,
    y: screen.y - (screen.y - camera.y) * ratio,
  };
}

/** Where the space opens: the top Story framed at full zoom. */
export function openingCamera(top: Rect, viewport: Size): Camera {
  return frameRect({ x: 0, y: 0, zoom: 1 }, top, viewport);
}

/**
 * What the camera is asked to do as the cards are laid out: `frame` a rect,
 * `nudge` one into view, `keep` a card where it was on screen after it moved
 * by `by` in the space, or `open` on the top Story.
 */
export type Aim =
  | { readonly kind: 'frame' | 'nudge'; readonly rect: Rect }
  | { readonly kind: 'keep'; readonly by: Point }
  | { readonly kind: 'open'; readonly top: Rect }
  | { readonly kind: 'stay' };

/**
 * The camera a layout ends with, from where it was headed: framed or nudged
 * per `aim`, then held inside the cards' bounds. Laying out and moving the
 * camera together this way lets both run as one animation.
 */
export function aimCamera(
  goal: Camera,
  aim: Aim,
  bounds: Rect,
  viewport: Size,
): Camera {
  const camera =
    aim.kind === 'frame'
      ? frameRect(goal, aim.rect, viewport)
      : aim.kind === 'nudge'
        ? nudgeIntoView(goal, aim.rect, viewport)
        : aim.kind === 'keep'
          ? {
              ...goal,
              x: goal.x - aim.by.x * goal.zoom,
              y: goal.y - aim.by.y * goal.zoom,
            }
          : aim.kind === 'open'
            ? openingCamera(aim.top, viewport)
            : goal;
  return clampCamera(camera, bounds, viewport);
}
