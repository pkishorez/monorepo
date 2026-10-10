import { motion, useTransform } from 'motion/react';

import type { CardValues, Rect } from '../../canvas-space';
import { laymoLayers } from '../layers';
import type { LaymoEdge } from '../laymo-edges';

/**
 * How a line reads: gray at rest, faded behind a preview, and while a card
 * is in focus blue for what it uses, violet for what uses it, white for a
 * chosen Rule. A Violation is red whatever the focus.
 */
export type EdgeTone = 'rest' | 'faded' | 'uses' | 'used-by' | 'chosen';

export const edgeStrokes = {
  rest: 'color-mix(in oklab, var(--muted-foreground) 50%, transparent)',
  faded: 'color-mix(in oklab, var(--muted-foreground) 18%, transparent)',
  uses: 'var(--laymo-uses)',
  'used-by': 'var(--laymo-used-by)',
  chosen: 'var(--foreground)',
  violation: 'var(--laymo-violation)',
} as const;

/**
 * The colors of focused lines, per theme: darker on a light page and
 * lighter on a dark one, so a line keeps its contrast with the ground.
 * Set on whatever holds the lines.
 */
export const edgeColorVars =
  '[--laymo-uses:oklch(0.52_0.16_250)] [--laymo-used-by:oklch(0.5_0.2_300)] [--laymo-violation:oklch(0.55_0.22_27)] dark:[--laymo-uses:oklch(0.72_0.13_235)] dark:[--laymo-used-by:oklch(0.7_0.15_300)] dark:[--laymo-violation:oklch(0.66_0.2_25)]';

/**
 * Where a line leaves `from` and enters `to`: the middle of a side, always,
 * so a line never moves as others come and go. Apart up and down, the
 * bottom of the upper card and the top of the lower; apart sideways, the
 * nearer sides.
 */
export function anchorsOf(
  from: Rect,
  to: Rect,
): {
  readonly start: { x: number; y: number };
  readonly end: { x: number; y: number };
  readonly vertical: boolean;
} {
  const below = to.y >= from.y + from.height;
  const above = to.y + to.height <= from.y;
  if (below || above) {
    return {
      start: {
        x: from.x + from.width / 2,
        y: below ? from.y + from.height : from.y,
      },
      end: {
        x: to.x + to.width / 2,
        y: below ? to.y : to.y + to.height,
      },
      vertical: true,
    };
  }
  const rightward = to.x >= from.x + from.width / 2;
  return {
    start: {
      x: rightward ? from.x + from.width : from.x,
      y: from.y + from.height / 2,
    },
    end: { x: rightward ? to.x : to.x + to.width, y: to.y + to.height / 2 },
    vertical: false,
  };
}

/** A smooth curve between two anchors, leaving and entering square to the card. */
export function curveOf(
  start: { x: number; y: number },
  end: { x: number; y: number },
  vertical: boolean,
): string {
  if (vertical) {
    const bend = Math.max(28, Math.abs(end.y - start.y) / 2);
    const sign = end.y >= start.y ? 1 : -1;
    return `M ${start.x} ${start.y} C ${start.x} ${start.y + sign * bend}, ${end.x} ${end.y - sign * bend}, ${end.x} ${end.y}`;
  }
  const bend = Math.max(28, Math.abs(end.x - start.x) / 2);
  const sign = end.x >= start.x ? 1 : -1;
  return `M ${start.x} ${start.y} C ${start.x + sign * bend} ${start.y}, ${end.x - sign * bend} ${end.y}, ${end.x} ${end.y}`;
}

const rectOf = (values: CardValues): Rect => ({
  x: values.x.get(),
  y: values.y.get(),
  width: values.width.get(),
  height: values.height.get(),
});

/**
 * One line between two cards, drawn from their motion values so it follows
 * them as they move. It only shows; nothing on it is pressed or pointed at.
 * An arrowhead points at what is imported. Lit, it rises above every card.
 */
export function Edge({
  edge,
  from,
  to,
  tone,
  depth,
}: {
  readonly edge: LaymoEdge;
  readonly from: CardValues;
  readonly to: CardValues;
  readonly tone: EdgeTone;
  /** The nesting level of the deeper card it joins. */
  readonly depth: number;
}) {
  const path = useTransform(() => {
    const { start, end, vertical } = anchorsOf(rectOf(from), rectOf(to));
    return curveOf(start, end, vertical);
  });
  const violation = edge.kind === 'violation';
  const stroke = violation ? edgeStrokes.violation : edgeStrokes[tone];
  const strong = tone === 'uses' || tone === 'used-by' || tone === 'chosen';
  const marker = `laymo-arrow-${edge.id.replace(/[^a-z0-9]+/gi, '-')}`;

  return (
    <svg
      aria-hidden
      width="1"
      height="1"
      style={{ zIndex: laymoLayers.line(strong, depth) }}
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
    >
      <defs>
        <marker
          id={marker}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={stroke} />
        </marker>
      </defs>
      <motion.path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strong ? 2 : 1.25}
        strokeLinecap="round"
        markerEnd={`url(#${marker})`}
        style={{
          transition: 'stroke 160ms ease-out, stroke-width 160ms ease-out',
        }}
      />
    </svg>
  );
}
