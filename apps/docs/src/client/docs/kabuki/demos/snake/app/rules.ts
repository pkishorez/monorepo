import { Schema } from 'effect';

/*
 * The board, as data: a square of cells with no walls, the four ways to
 * go, and the moves between cells. A move off one edge comes back on the
 * other. Everything here is pure, so the Actors and the View agree on it.
 */

/** The board is this many cells a side. */
export const CELLS = 12;
/** How often the snake moves one cell, in milliseconds. */
export const TICK = 180;
/** How many cells a bite sends the snake back, while a life is left. */
export const REWIND = 3;
/** How long a bite is shown, where it happened, before anything moves. */
export const HIT = 450;
/** How long each cell back takes. */
export const BACK = 260;
/** How long the snake rests after a rewind before it moves on. */
export const RECOVER = 500;
/** How long the last bite is shown before the game ends. */
export const FALL = 900;
/** Lives at the start of a game. */
export const LIVES = 3;

export const Cell = Schema.Struct({ x: Schema.Number, y: Schema.Number });
export type Cell = typeof Cell.Type;

export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export const Direction = Schema.Literals(DIRECTIONS);
export type Direction = typeof Direction.Type;

export const isDirection = (value: string): value is Direction =>
  (DIRECTIONS as ReadonlyArray<string>).includes(value);

const MOVES: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/** The cell one move from `cell`. */
export const step = (cell: Cell, direction: Direction): Cell => ({
  x: cell.x + MOVES[direction].x,
  y: cell.y + MOVES[direction].y,
});

export const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

const around = (n: number) => ((n % CELLS) + CELLS) % CELLS;

/**
 * The board's cell for a cell anywhere on the track. The track runs on
 * past the edges, so it never jumps; the board wraps it.
 */
export const wrap = ({ x, y }: Cell): Cell => ({ x: around(x), y: around(y) });

export const reverses = (from: Direction, to: Direction) =>
  OPPOSITE[from] === to;

/** The way from one cell to the next one along the track. */
export const directionOf = (from: Cell, to: Cell): Direction =>
  to.x > from.x
    ? 'right'
    : to.x < from.x
      ? 'left'
      : to.y > from.y
        ? 'down'
        : 'up';

/** Every cell of the board, row by row. */
export const ALL: ReadonlyArray<Cell> = Array.from(
  { length: CELLS * CELLS },
  (_, i) => ({ x: i % CELLS, y: Math.floor(i / CELLS) }),
);

/** Cells from a start, walked by a string of moves: U, D, L, R. */
export const walk = (start: Cell, moves: string): ReadonlyArray<Cell> => {
  const cells = [start];
  for (const move of moves) {
    const direction = ({ U: 'up', D: 'down', L: 'left', R: 'right' } as const)[
      move as 'U' | 'D' | 'L' | 'R'
    ];
    cells.push(step(cells.at(-1)!, direction));
  }
  return cells;
};
