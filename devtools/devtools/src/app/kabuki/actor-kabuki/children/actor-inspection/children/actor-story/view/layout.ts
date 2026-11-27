import type { Plan, Rect } from '@kestack/devtools-kabuki/devtools';

export interface Placed extends Rect {
  readonly plan: Plan;
  readonly parent: string | null;
}

export const WIDTH = 288;

const GAP_X = 96;

const GAP_Y = 24;

const ANCHOR = 22;

export const layout = (
  root: Plan,
  heightOf: (path: string) => number,
): ReadonlyArray<Placed> => {
  const spans = new Map<string, number>();
  const span = (plan: Plan): number => {
    const block =
      plan.children.reduce((sum, { plan: child }) => sum + span(child), 0) +
      Math.max(0, plan.children.length - 1) * GAP_Y;
    const height = Math.max(heightOf(plan.path), block);
    spans.set(plan.path, height);
    return height;
  };
  span(root);
  const placed: Array<Placed> = [];
  const place = (
    plan: Plan,
    depth: number,
    top: number,
    parent: string | null,
  ) => {
    const height = heightOf(plan.path);
    const room = spans.get(plan.path)!;
    placed.push({
      plan,
      parent,
      x: depth * (WIDTH + GAP_X),
      y: top + (room - height) / 2,
      width: WIDTH,
      height,
    });
    const block =
      plan.children.reduce(
        (sum, { plan: child }) => sum + spans.get(child.path)!,
        0,
      ) +
      Math.max(0, plan.children.length - 1) * GAP_Y;
    let cursor = top + (room - block) / 2;
    for (const { plan: child } of plan.children) {
      place(child, depth + 1, cursor, plan.path);
      cursor += spans.get(child.path)! + GAP_Y;
    }
  };
  place(root, 0, 0, null);
  return placed;
};

export interface Point {
  readonly x: number;
  readonly y: number;
}

type Curve = readonly [Point, Point, Point, Point];

const LOOP = 64;

const bend = (start: Point, end: Point): Curve => {
  const reach = Math.max(40, Math.abs(end.x - start.x) / 2);
  const way = end.x >= start.x ? 1 : -1;
  return [
    start,
    { x: start.x + way * reach, y: start.y },
    { x: end.x - way * reach, y: end.y },
    end,
  ];
};

export const curveOf = (from: Point, to: Point): Curve => {
  if (from.x + WIDTH <= to.x)
    return bend(
      { x: from.x + WIDTH, y: from.y + ANCHOR },
      { x: to.x, y: to.y + ANCHOR },
    );
  if (to.x + WIDTH <= from.x)
    return bend(
      { x: from.x, y: from.y + ANCHOR },
      { x: to.x + WIDTH, y: to.y + ANCHOR },
    );
  const edge = Math.max(from.x, to.x) + WIDTH + LOOP;
  return [
    { x: from.x + WIDTH, y: from.y + ANCHOR },
    { x: edge, y: from.y + ANCHOR },
    { x: edge, y: to.y + ANCHOR },
    { x: to.x + WIDTH, y: to.y + ANCHOR },
  ];
};

export const pathOf = ([start, one, two, end]: Curve) =>
  `M ${start.x} ${start.y} C ${one.x} ${one.y}, ${two.x} ${two.y}, ${end.x} ${end.y}`;

export const middleOf = ([start, one, two, end]: Curve): Point => ({
  x: (start.x + 3 * one.x + 3 * two.x + end.x) / 8,
  y: (start.y + 3 * one.y + 3 * two.y + end.y) / 8,
});
