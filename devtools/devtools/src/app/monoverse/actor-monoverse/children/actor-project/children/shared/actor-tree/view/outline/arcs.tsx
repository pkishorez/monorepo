import { memo, useMemo, useSyncExternalStore } from 'react';

import type { Connection } from '../../logic/shared/index.js';
import { rowHeight, type Placement } from './layout.js';

export interface Hovered {
  readonly get: () => string | null;
  readonly set: (path: string | null) => void;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createHovered(): Hovered {
  let current: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (path) => {
      if (path === current) return;
      current = path;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

interface Arc {
  readonly key: string;
  readonly path: string;
  readonly bend: number;
  readonly d: string;
  readonly colour: string;
  readonly head: number;
  readonly tail: number;
}

const lane = { uses: -3.5, usedBy: 3.5 } as const;

export const OutlineArcs = memo(function OutlineArcs({
  selected,
  selectedIndex,
  connections,
  indexOf,
  place,
  lead,
  hovered,
  still,
}: {
  selected: string;
  selectedIndex: number;
  connections: ReadonlyMap<string, Connection>;
  indexOf: (path: string) => number | undefined;
  place: Placement;
  lead: number;
  hovered: Hovered;
  still: boolean;
}) {
  const edge = lead - 2;
  const from = place.middle(selectedIndex);
  const arcs = useMemo(() => {
    const drawn: Array<Arc> = [];
    const room = edge - 8;
    for (const [path, connection] of connections) {
      const index = indexOf(path);
      if (index === undefined) continue;
      const to = place.middle(index);
      const rows = Math.abs(to - from) / rowHeight;
      const colourOf = (plain: string) =>
        connection.broken > 0
          ? 'var(--outline-broken)'
          : connection.excepted > 0
            ? 'var(--outline-excepted)'
            : plain;
      const draw = (start: number, end: number, bend: number) => {
        const out = edge - bend;
        const stop = edge - 5;
        return `M ${edge} ${start} C ${out} ${start}, ${out} ${end}, ${stop} ${end}`;
      };
      const bend = Math.min(room, 10 + rows * 5);
      if (connection.uses > 0) {
        const start = from + lane.uses;
        const end = to + lane.uses;
        drawn.push({
          key: `${path}:uses`,
          path,
          bend,
          d: draw(start, end, bend),
          colour: colourOf('var(--outline-uses)'),
          head: end,
          tail: start,
        });
      }
      if (connection.usedBy > 0) {
        const start = to + lane.usedBy;
        const end = from + lane.usedBy;
        drawn.push({
          key: `${path}:usedBy`,
          path,
          bend: Math.min(room, bend + 3),
          d: draw(start, end, Math.min(room, bend + 3)),
          colour: colourOf('var(--outline-used-by)'),
          head: end,
          tail: start,
        });
      }
    }
    return drawn.sort((left, right) => right.bend - left.bend);
  }, [connections, indexOf, place, from, edge]);
  const pointed = useSyncExternalStore(hovered.subscribe, hovered.get);
  const focus =
    pointed !== null && pointed !== selected && connections.has(pointed)
      ? pointed
      : null;

  if (arcs.length === 0) return null;
  const dim = (arc: Arc) => focus !== null && focus !== arc.path;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width={lead}
      height={1}
    >
      <g
        key={selected}
        fill="none"
        strokeLinecap="round"
        className={still ? 'outline-still' : undefined}
      >
        {arcs.map((arc) => (
          <path
            key={arc.key}
            className="outline-arc"
            d={arc.d}
            pathLength={1}
            stroke={arc.colour}
            strokeWidth={focus === arc.path ? 2.25 : 1.75}
            opacity={dim(arc) ? 0.2 : 1}
          />
        ))}
        {arcs.map((arc) => (
          <g
            key={`${arc.key}:ends`}
            className="outline-port"
            opacity={dim(arc) ? 0.25 : 1}
          >
            <circle cx={edge} cy={arc.tail} r={2} fill={arc.colour} />
            <path
              d={`M ${edge - 6.5} ${arc.head - 3.5} L ${edge + 0.5} ${arc.head} L ${edge - 6.5} ${arc.head + 3.5} Z`}
              fill={arc.colour}
              stroke={arc.colour}
              strokeWidth={1}
              strokeLinejoin="round"
            />
          </g>
        ))}
      </g>
    </svg>
  );
});
