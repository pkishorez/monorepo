import type { Scroll } from '../../engine';
import type { EdgeStrips } from '../../../environment';
import type { ZoneSource } from '../../provider';
import type { Rect } from '../../zone';
import type { Frame, Painter } from '../canvas';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const FINGER_RADIUS = 14;
const HATCH_PX = 8;
// Native scrollers are found by reading every element's style, so the list
// is refreshed at most this often while painting.
const SCROLLERS_MS = 1000;

type Zone = { readonly rect: Rect; readonly strips: EdgeStrips };

/** Each nested zone's outline steps in a little, so nested outlines stay apart. */
const NEST_INSET_PX = 3;

const label = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  rotate: number,
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotate);
  ctx.fillText(text, 0, 0);
  ctx.restore();
};

/** One zone, outlined and labelled with its scroll rule. */
const paintZone = (
  { ctx, color, height }: Frame,
  zone: Zone,
  scroll: Scroll,
  depth: number,
) => {
  const inset = depth * NEST_INSET_PX;
  const top = Math.max(zone.rect.top, 0) + inset;
  const bottom = Math.min(zone.rect.bottom, height) - inset;
  if (bottom <= top) return;

  ctx.fillStyle = color('--gz-zone', 0.05);
  ctx.fillRect(
    zone.rect.left,
    top,
    zone.rect.right - zone.rect.left,
    bottom - top,
  );
  ctx.strokeStyle = color('--gz-zone', 0.6);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(
    zone.rect.left + inset + 0.75,
    top + 0.75,
    zone.rect.right - zone.rect.left - inset * 2 - 1.5,
    bottom - top - 1.5,
  );
  ctx.setLineDash([]);
  ctx.font = `600 10px ${MONO}`;
  ctx.fillStyle = color('--gz-zone', 0.9);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `GESTURE ZONE · SCROLL ${scroll.toUpperCase()}`,
    zone.rect.left + inset + 8,
    top + 8,
  );
};

/** The edge strips along the viewport's sides, labelled with their owner. */
const paintStrips = ({ ctx, color, width, height }: Frame, zone: Zone) => {
  const top = Math.max(zone.rect.top, 0);
  const bottom = Math.min(zone.rect.bottom, height);
  if (bottom <= top) return;
  const { left, right } = zone.strips;
  ctx.fillStyle = color('--gz-edge', 0.16);
  ctx.fillRect(0, top, left.width, bottom - top);
  ctx.fillRect(width - right.width, top, right.width, bottom - top);

  ctx.font = `600 10px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (bottom - top > 120) {
    const middle = (top + bottom) / 2;
    ctx.fillStyle = color('--gz-edge', 0.95);
    label(
      ctx,
      `${left.owner.toUpperCase()} · ${left.width}PX`,
      left.width / 2,
      middle,
      -Math.PI / 2,
    );
    label(
      ctx,
      `${right.owner.toUpperCase()} · ${right.width}PX`,
      width - right.width / 2,
      middle,
      Math.PI / 2,
    );
  }
};

/** A native scroller, shaded and hatched: touches that start in it are its own. */
const paintScroller = ({ ctx, color }: Frame, box: DOMRect) => {
  if (box.width === 0 || box.height === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.left, box.top, box.width, box.height);
  ctx.clip();
  ctx.fillStyle = color('--gz-native', 0.08);
  ctx.fill();
  ctx.strokeStyle = color('--gz-native', 0.3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let d = -box.height; d < box.width; d += HATCH_PX) {
    ctx.moveTo(box.left + d, box.bottom);
    ctx.lineTo(box.left + d + box.height, box.top);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = color('--gz-native', 0.7);
  ctx.lineWidth = 1;
  ctx.strokeRect(box.left + 0.5, box.top + 0.5, box.width - 1, box.height - 1);
  ctx.font = `600 10px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillStyle = color('--gz-native', 0.95);
  ctx.fillText('NATIVE', box.right - 6, box.top + 6);
};

const paintFinger = (
  { ctx, color }: Frame,
  id: number,
  at: { readonly x: number; readonly y: number },
) => {
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color('--gz-pointer', 0.9);
  ctx.beginPath();
  ctx.arc(at.x, at.y, FINGER_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color('--gz-text');
  ctx.font = `600 11px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(id), at.x, at.y);
};

/**
 * Paints every zone labelled with its scroll rule, the edge strips labelled
 * with their owner, the native scrollers inside, and each finger's pointer
 * id. `place` gets the outermost zone each frame, to pin the Environment
 * line to its corner.
 */
export const createDebugPainter = (
  source: ZoneSource,
  place: (zone: Rect | undefined) => void,
): Painter => {
  let scrollers: ReadonlyArray<Element> = [];
  let foundAt = -Infinity;
  return (frame) => {
    const zones = source.zones().flatMap((view) => {
      const measured = view.measure();
      return measured === undefined ? [] : [{ view, measured }];
    });
    // Outermost first: a zone's depth is how many zones contain it.
    const depthOf = (rect: Rect) =>
      zones.filter(
        ({ measured }) =>
          measured.bounds.left <= rect.left &&
          measured.bounds.top <= rect.top &&
          measured.bounds.right >= rect.right &&
          measured.bounds.bottom >= rect.bottom,
      ).length - 1;
    const outer = zones
      .map(({ measured }) => measured)
      .sort((a, b) => depthOf(a.bounds) - depthOf(b.bounds))[0];
    place(outer?.rect);
    if (outer === undefined) return false;
    paintStrips(frame, outer);
    for (const { view, measured } of zones) {
      paintZone(
        frame,
        measured,
        view.scroll(),
        Math.max(0, depthOf(measured.bounds)),
      );
    }
    if (frame.now - foundAt > SCROLLERS_MS) {
      scrollers = source.scrollers();
      foundAt = frame.now;
    }
    for (const scroller of scrollers) {
      paintScroller(frame, scroller.getBoundingClientRect());
    }
    for (const { view } of zones) {
      for (const finger of view.inspect()?.fingers ?? []) {
        paintFinger(frame, finger.id, finger.current);
      }
    }
    return false;
  };
};
