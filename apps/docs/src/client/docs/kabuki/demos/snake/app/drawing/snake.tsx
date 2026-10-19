import { useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Transition } from 'motion/react';
import { BACK, CELLS, TICK } from '../rules.ts';
import type { Cell } from '../rules.ts';

/*
 * The board, drawn. The snake is never drawn cell by cell: the track is
 * one path through the middle of its cells, rounded at every turn, and
 * the snake is a stretch of that path, from its tail to its head. A move
 * only changes where the stretch starts and ends, so Motion slides it
 * along the path, round every corner, forward on a tick and back on a
 * rewind or a past Step. The head rides the same path, turned the way
 * the path goes. The track runs on past the board's edges, so the path
 * never jumps; the board draws the snake once per tile it spans, shifted
 * back onto the board, and a snake leaving one edge slides in at the
 * other.
 */

/** A cell's size on screen, in pixels. */
export const CELL = 32;
/** The board's side, in pixels. */
export const BOARD = CELLS * CELL;

/**
 * The snake's and the food's colors, one value for each theme. Red is kept
 * for a bite alone, so the food is orange.
 */
export const COLORS = [
  '[--snake:oklch(0.62_0.14_152)] dark:[--snake:oklch(0.72_0.14_152)]',
  '[--snake-head:oklch(0.5_0.13_152)] dark:[--snake-head:oklch(0.84_0.13_152)]',
  '[--snake-hurt:oklch(0.62_0.2_25)] dark:[--snake-hurt:oklch(0.68_0.19_25)]',
  '[--snake-hurt-head:oklch(0.5_0.19_25)] dark:[--snake-hurt-head:oklch(0.8_0.15_25)]',
  '[--snake-dead:oklch(0.72_0.01_260)] dark:[--snake-dead:oklch(0.45_0.01_260)]',
  '[--snake-eye:oklch(0.99_0_0)] [--snake-pupil:oklch(0.22_0.02_260)]',
  '[--food:oklch(0.74_0.16_60)] dark:[--food:oklch(0.78_0.15_65)]',
  '[--food-leaf:oklch(0.6_0.13_140)] dark:[--food-leaf:oklch(0.7_0.13_140)]',
].join(' ');

/** How the snake is: playing, just bitten, or out of lives. */
export type Look = 'well' | 'hurt' | 'dead';

const BODY: Record<Look, string> = {
  well: 'var(--snake)',
  hurt: 'var(--snake-hurt)',
  dead: 'var(--snake-dead)',
};
const HEAD: Record<Look, string> = {
  well: 'var(--snake-head)',
  hurt: 'var(--snake-hurt-head)',
  dead: 'var(--snake-dead)',
};
/** A change of look fades, on CSS's clock: colors are not Motion's. */
const FADE = { transition: 'stroke 250ms ease, fill 250ms ease' };

const RADIUS = CELL / 2;
/** Half a cell along the path: straight through a cell, or half its turn. */
const HALF = { straight: CELL / 2, turn: (Math.PI * RADIUS) / 4 };
/** Longer than any track, so each stretch is drawn once. */
const GAP = 1e5;

/** A cell's middle, in pixels. */
const mid = ({ x, y }: Cell) => ({ x: (x + 0.5) * CELL, y: (y + 0.5) * CELL });

const towards = (from: Cell, to: Cell) => ({
  x: Math.sign(to.x - from.x),
  y: Math.sign(to.y - from.y),
});

/**
 * The track as one path, every turn drawn as a quarter circle through its
 * cell, and how far along the path each cell sits: at its middle, or
 * halfway round its turn. Every turn the track has is rounded, ahead of
 * the head too, so the path keeps its shape while the head slides back
 * along it.
 */
export const routeOf = (track: ReadonlyArray<Cell>) => {
  const turns = (i: number) => {
    if (i <= 0 || i >= track.length - 1) return false;
    const a = towards(track[i - 1]!, track[i]!);
    const b = towards(track[i]!, track[i + 1]!);
    return a.x !== b.x || a.y !== b.y;
  };
  const half = (i: number) => (turns(i) ? HALF.turn : HALF.straight);
  const first = mid(track[0]!);
  let d = `M ${first.x} ${first.y}`;
  const along = [0];
  for (let i = 1; i < track.length; i++) {
    along.push(along[i - 1]! + half(i - 1) + half(i));
    const { x, y } = mid(track[i]!);
    if (!turns(i)) {
      d += ` L ${x} ${y}`;
      continue;
    }
    const a = towards(track[i - 1]!, track[i]!);
    const b = towards(track[i]!, track[i + 1]!);
    const clockwise = a.x * b.y - a.y * b.x > 0 ? 1 : 0;
    d += ` L ${x - a.x * RADIUS} ${y - a.y * RADIUS}`;
    d += ` A ${RADIUS} ${RADIUS} 0 0 ${clockwise} ${x + b.x * RADIUS} ${y + b.y * RADIUS}`;
  }
  return { d, along };
};

/** A tick glides at a steady pace; a move back eases there, a cell at a time. */
const pace = (at: number, from: number): Transition =>
  at < from
    ? {
        duration: (Math.min(from - at, 3) * BACK * 0.85) / 1000,
        ease: [0.65, 0, 0.35, 1],
      }
    : { duration: TICK / 1000, ease: 'linear' };

/** Where `at` was before it last changed, kept the way React keeps a previous value. */
const useFrom = (at: number) => {
  const [seen, setSeen] = useState({ at, from: at });
  if (seen.at !== at) setSeen({ at, from: seen.at });
  return seen.at === at ? seen.from : seen.at;
};

/**
 * The board-sized tiles the snake is in, or a cell from: one copy almost
 * always, two as it nears an edge, so a copy is in place before the snake
 * slides into it, either way.
 */
const tilesOf = (cells: ReadonlyArray<Cell>) => {
  const span = (ns: ReadonlyArray<number>) => {
    const from = Math.floor((Math.min(...ns) - 1) / CELLS);
    const to = Math.floor((Math.max(...ns) + 1) / CELLS);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  };
  const xs = span(cells.map((cell) => cell.x));
  const ys = span(cells.map((cell) => cell.y));
  return xs.flatMap((x) => ys.map((y) => ({ x, y })));
};

export function Board({
  track,
  at,
  length,
  food = null,
  look = 'well',
  children,
}: {
  /** Every cell the head has been on, in order, running on past the edges. */
  readonly track: ReadonlyArray<Cell>;
  /** The head's place on the track. */
  readonly at: number;
  readonly length: number;
  /** On the board, wrapped. */
  readonly food?: Cell | null;
  readonly look?: Look;
  /** Laid over the board. */
  readonly children?: ReactNode;
}) {
  const transition = pace(at, useFrom(at));
  const route = routeOf(track);
  const snake = { route, at, length, look, transition };
  return (
    <div className="relative" style={{ width: BOARD, height: BOARD }}>
      <svg
        aria-hidden
        viewBox={`0 0 ${BOARD} ${BOARD}`}
        className="absolute inset-0"
      >
        <AnimatePresence initial={false}>
          {food && <Food key={`${food.x},${food.y}`} cell={food} />}
        </AnimatePresence>
      </svg>
      {/* The board has no walls: the snake is drawn once per tile, shifted
          onto the board, and the board cuts each copy at its edge. */}
      <div className="absolute inset-0 overflow-hidden">
        {tilesOf(track.slice(at - length + 1, at + 1)).map((tile) => (
          <div
            key={`${tile.x},${tile.y}`}
            className="absolute inset-0"
            style={{
              transform: `translate(${-tile.x * BOARD}px, ${-tile.y * BOARD}px)`,
            }}
          >
            <Snake {...snake} />
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

/** The snake along its route: its tail narrowing, its body, its head. */
function Snake({
  route: { d, along },
  at,
  length,
  look,
  transition,
}: {
  readonly route: ReturnType<typeof routeOf>;
  readonly at: number;
  readonly length: number;
  readonly look: Look;
  readonly transition: Transition;
}) {
  const tail = at - length + 1;
  // The tail narrows over its last two cells; the body runs on to the head.
  const stretches = [
    { from: tail, to: tail + 1, width: 0.34 },
    { from: tail + 1, to: tail + 2, width: 0.54 },
    { from: tail + 2, to: at, width: 0.72 },
  ];
  return (
    <>
      <svg aria-hidden className="absolute inset-0 size-full overflow-visible">
        {stretches.map(({ from, to, width }) => (
          <motion.path
            key={width}
            d={d}
            fill="none"
            stroke={BODY[look]}
            style={FADE}
            strokeWidth={CELL * width}
            strokeLinecap="round"
            initial={false}
            animate={{
              strokeDasharray: `${along[to]! - along[from]!} ${GAP}`,
              strokeDashoffset: -along[from]!,
            }}
            transition={transition}
          />
        ))}
      </svg>
      <motion.div
        aria-hidden
        className="absolute top-0 left-0"
        style={{
          width: CELL,
          height: CELL,
          offsetPath: `path("${d}")`,
          offsetRotate: 'auto',
        }}
        initial={false}
        animate={{ offsetDistance: `${along[at]}px` }}
        transition={transition}
      >
        <Head look={look} />
      </motion.div>
    </>
  );
}

/**
 * The head, facing right: the path turns it the way it goes. Bitten, it
 * jolts back, a ring goes out from it, and its eyes shut; out of lives,
 * its eyes are crossed.
 */
function Head({ look }: { readonly look: Look }) {
  const hurt = look === 'hurt';
  return (
    <motion.div
      className="relative size-full"
      initial={false}
      animate={hurt ? { x: [0, -6, 2, 0] } : { x: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <AnimatePresence>
        {hurt && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border-2"
            style={{ borderColor: 'var(--snake-hurt)' }}
            initial={{ scale: 0.8, opacity: 0.9 }}
            animate={{ scale: 2.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          />
        )}
      </AnimatePresence>
      <svg viewBox="0 0 1 1" className="relative size-full">
        <circle cx={0.5} cy={0.5} r={0.48} fill={HEAD[look]} style={FADE} />
        {[0.31, 0.69].map((y) =>
          look === 'well' ? (
            <g key={y}>
              <circle cx={0.64} cy={y} r={0.12} fill="var(--snake-eye)" />
              <circle cx={0.68} cy={y} r={0.06} fill="var(--snake-pupil)" />
            </g>
          ) : (
            <path
              key={y}
              d={
                hurt
                  ? `M 0.56 ${y} l 0.16 0`
                  : `M 0.56 ${y - 0.08} l 0.16 0.16 m 0 -0.16 l -0.16 0.16`
              }
              stroke="var(--snake-eye)"
              strokeWidth={0.07}
              strokeLinecap="round"
            />
          ),
        )}
      </svg>
    </motion.div>
  );
}

/** An apple: it grows in where it lands, and swells away as it is eaten. */
function Food({ cell }: { readonly cell: Cell }) {
  const { x, y } = mid(cell);
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.5 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
    >
      <circle cx={x} cy={y} r={CELL * 0.3} fill="var(--food)" />
      <path
        d={`M ${x} ${y - CELL * 0.28} q ${CELL * 0.08} ${-CELL * 0.16} ${CELL * 0.22} ${-CELL * 0.14}`}
        fill="none"
        stroke="var(--food-leaf)"
        strokeWidth={CELL * 0.09}
        strokeLinecap="round"
      />
    </motion.g>
  );
}
