import type { Card, Folded, More } from '../logic/shared/index.ts';
import type { Rect } from './space.ts';

export interface Placed extends Rect {
  readonly id: string;
  readonly card: Card | null;
  readonly more: More | null;
  readonly parent: string | null;
  readonly leaf: boolean;
  readonly top: number;
}

export const WIDTH = 320;

const ANCHOR = 22;

const GAP_X = 120;

const GAP_Y = 20;

const moreId = (parent: string) => `${parent}\u0000more`;

interface Spot {
  readonly id: string;
  readonly card: Card | null;
  readonly more: More | null;
  readonly children: ReadonlyArray<Spot>;
}

const spotOf = (folded: Folded): Spot => ({
  id: folded.card.node.address,
  card: folded.card,
  more: null,
  children: [
    ...folded.children.map(spotOf),
    ...(folded.more
      ? [
          {
            id: moreId(folded.more.parent),
            card: null,
            more: folded.more,
            children: [],
          },
        ]
      : []),
  ],
});

export const layout = (
  root: Folded,
  heightOf: (id: string) => number,
  topOf: (id: string) => number = () => 0,
): ReadonlyArray<Placed> => {
  const spans = new Map<string, number>();
  const span = (spot: Spot): number => {
    const block =
      spot.children.reduce((sum, child) => sum + span(child), 0) +
      Math.max(0, spot.children.length - 1) * GAP_Y;
    const height = Math.max(heightOf(spot.id), block);
    spans.set(spot.id, height);
    return height;
  };
  const tree = spotOf(root);
  span(tree);
  const placed: Array<Placed> = [];
  const place = (
    spot: Spot,
    depth: number,
    top: number,
    parent: string | null,
  ) => {
    placed.push({
      id: spot.id,
      card: spot.card,
      more: spot.more,
      parent,
      leaf: spot.children.length === 0,
      x: depth * (WIDTH + GAP_X),
      y: top,
      width: WIDTH,
      height: heightOf(spot.id),
      top: topOf(spot.id),
    });
    let cursor = top;
    for (const child of spot.children) {
      place(child, depth + 1, cursor, spot.id);
      cursor += spans.get(child.id)! + GAP_Y;
    }
  };
  place(tree, 0, 0, null);
  return placed;
};

export const anchorOf = (placed: Placed) => placed.y + placed.top + ANCHOR;

interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Curve {
  readonly d: string;
  readonly start: Point;
  readonly middle: Point;
}

const BEND = 48;

const LOOP = 40;

const bezier = (start: Point, one: Point, two: Point, end: Point): Curve => ({
  d: `M ${start.x} ${start.y} C ${one.x} ${one.y}, ${two.x} ${two.y}, ${end.x} ${end.y}`,
  start,
  middle: {
    x: (start.x + 3 * one.x + 3 * two.x + end.x) / 8,
    y: (start.y + 3 * one.y + 3 * two.y + end.y) / 8,
  },
});

const across = (start: Point, end: Point): Curve => {
  const bend = Math.max(BEND, Math.abs(end.x - start.x) / 2);
  const way = end.x > start.x ? 1 : -1;
  return bezier(
    start,
    { x: start.x + way * bend, y: start.y },
    { x: end.x - way * bend, y: end.y },
    end,
  );
};

export const branch = (parent: Placed, child: Placed): string =>
  across(
    { x: parent.x + parent.width, y: anchorOf(parent) },
    { x: child.x, y: anchorOf(child) },
  ).d;

export const link = (
  from: Placed,
  fromY: number,
  to: Placed,
  toY: number,
): Curve => {
  if (from.x + from.width < to.x)
    return across({ x: from.x + from.width, y: fromY }, { x: to.x, y: toY });
  if (to.x + to.width < from.x)
    return across({ x: from.x, y: fromY }, { x: to.x + to.width, y: toY });
  const edge = Math.max(from.x + from.width, to.x + to.width);
  return bezier(
    { x: from.x + from.width, y: fromY },
    { x: edge + LOOP * 2, y: fromY },
    { x: edge + LOOP * 2, y: toY },
    { x: to.x + to.width, y: toY },
  );
};

export const loop = (
  card: Placed,
  from: number,
  to: number,
  right: boolean,
): Curve => {
  const edge = right ? card.x + card.width : card.x;
  const out = right ? edge + LOOP : edge - LOOP;
  return bezier(
    { x: edge, y: card.y + from },
    { x: out, y: card.y + from },
    { x: out, y: card.y + to },
    { x: edge, y: card.y + to },
  );
};
