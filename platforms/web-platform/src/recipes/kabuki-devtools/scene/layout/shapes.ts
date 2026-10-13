/*
 * What both layouts take and give: boxes in, placed boxes, lines and their
 * labels out. Pure, and knows nothing of what the boxes stand for.
 */

/** One box to lay out, and what hangs below it, each marked with what led there, if anything did. */
export interface Branch {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly children: ReadonlyArray<{
    readonly via?: string;
    readonly branch: Branch;
  }>;
}

/** A box's place: its top-left corner. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly parent?: string;
}

/** A line from one box to one below it, as SVG path data. */
export interface Line {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly via?: string;
  readonly d: string;
}

/** What led from a box to some below it, written on their lines. */
export interface Label {
  readonly id: string;
  readonly owner: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  /** Centred on its point, or starting from it. */
  readonly align: 'middle' | 'start';
}

export interface Laid {
  readonly boxes: ReadonlyMap<string, Box>;
  readonly lines: ReadonlyArray<Line>;
  readonly labels: ReadonlyArray<Label>;
}

type Point = { readonly x: number; readonly y: number };

/** How far down a curve leaves and arrives straight: half the drop. */
const controls = (from: Point, to: Point, first: 'down' | 'across') =>
  first === 'down'
    ? ([
        { x: from.x, y: from.y + (to.y - from.y) / 2 },
        { x: to.x, y: to.y - (to.y - from.y) / 2 },
      ] as const)
    : ([
        { x: from.x, y: to.y },
        { x: from.x + (to.x - from.x) / 3, y: to.y },
      ] as const);

/**
 * A smooth curve from one point to another, as one cubic Bézier: leaving
 * straight down and arriving straight down, or down a spine then across.
 * Every line is the same four points, so one can turn into another.
 */
export const curve = (
  from: Point,
  to: Point,
  first: 'down' | 'across' = 'down',
) => {
  const [a, b] = controls(from, to, first);
  return `M ${from.x} ${from.y} C ${a.x} ${a.y} ${b.x} ${b.y} ${to.x} ${to.y}`;
};

/** The point a share `t` of the way along a curve, to write on it. */
export const along = (
  from: Point,
  to: Point,
  t: number,
  first: 'down' | 'across' = 'down',
): Point => {
  const [a, b] = controls(from, to, first);
  const u = 1 - t;
  const at = (p: number, q: number, r: number, s: number) =>
    u * u * u * p + 3 * u * u * t * q + 3 * u * t * t * r + t * t * t * s;
  return { x: at(from.x, a.x, b.x, to.x), y: at(from.y, a.y, b.y, to.y) };
};
