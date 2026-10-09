import { Schema } from 'effect';

/*
 * The picture as data: a square of cells, each empty or a palette index.
 * Painting, erasing, filling and mirroring are plain functions.
 */

export const Cell = Schema.NullOr(Schema.Number);
export type Cell = typeof Cell.Type;

export const Grid = Schema.Array(Schema.Array(Cell));
export type Grid = typeof Grid.Type;

export type Mirror = 'None' | 'Horizontal' | 'Vertical' | 'Both';

export const SIZES = [8, 16, 24, 32] as const;
export const DEFAULT_SIZE = 16;
/** Undo steps kept. */
const HISTORY = 50;

export const emptyGrid = (size: number): Grid =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null));

export const isEmpty = (grid: Grid) =>
  grid.every((row) => row.every((cell) => cell === null));

/** The cell at `x, y` and its mirror images. */
export const mirrored = (
  x: number,
  y: number,
  size: number,
  mirror: Mirror,
): ReadonlyArray<readonly [number, number]> => {
  const mx = size - 1 - x;
  const my = size - 1 - y;
  switch (mirror) {
    case 'Both':
      return [
        [x, y],
        [mx, y],
        [x, my],
        [mx, my],
      ];
    case 'Horizontal':
      return [
        [x, y],
        [mx, y],
      ];
    case 'Vertical':
      return [
        [x, y],
        [x, my],
      ];
    case 'None':
      return [[x, y]];
  }
};

/** Set every cell at `places` to `cell`. */
export const paint = (
  grid: Grid,
  places: ReadonlyArray<readonly [number, number]>,
  cell: Cell,
): Grid =>
  grid.map((row, y) =>
    row.map((old, x) =>
      places.some(([px, py]) => px === x && py === y) ? cell : old,
    ),
  );

/** Fill the region of like cells around `x, y` with `cell`. */
export const fill = (grid: Grid, x: number, y: number, cell: Cell): Grid => {
  const target = grid[y]?.[x];
  if (target === undefined || target === cell) return grid;
  const result = grid.map((row) => [...row]);
  const stack: Array<readonly [number, number]> = [[x, y]];
  for (let next = stack.pop(); next; next = stack.pop()) {
    const [cx, cy] = next;
    const row = result[cy];
    if (!row || row[cx] !== target) continue;
    row[cx] = cell;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return result;
};

/** Keep `grid` on top of the undo stack, forgetting the oldest beyond the limit. */
export const remember = (stack: ReadonlyArray<Grid>, grid: Grid) =>
  [...stack, grid].slice(-HISTORY);
