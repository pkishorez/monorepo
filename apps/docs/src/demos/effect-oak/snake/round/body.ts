import { Schema } from 'effect';

/*
 * The snake as data, on a grid that wraps at its edges: where it is, and
 * how it moves, grows and runs into itself. Plain functions, no Effects.
 */

export const GRID = 20;

export const Position = Schema.Struct({ x: Schema.Number, y: Schema.Number });
export type Position = typeof Position.Type;

export const Direction = Schema.Literals(['Up', 'Down', 'Left', 'Right']);
export type Direction = typeof Direction.Type;

/** Head first. */
export const Body = Schema.NonEmptyArray(Position);
export type Body = typeof Body.Type;

const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  Up: 'Down',
  Down: 'Up',
  Left: 'Right',
  Right: 'Left',
};

export const isOpposite = (a: Direction, b: Direction) => OPPOSITE[a] === b;

export const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y;

const wrap = (n: number) => (n + GRID) % GRID;

export const move = ({ x, y }: Position, direction: Direction): Position => ({
  x: wrap(x + (direction === 'Left' ? -1 : direction === 'Right' ? 1 : 0)),
  y: wrap(y + (direction === 'Up' ? -1 : direction === 'Down' ? 1 : 0)),
});

/** A snake three long, heading right from `head`. */
export const start = (head: Position): Body => [
  head,
  { x: head.x - 1, y: head.y },
  { x: head.x - 2, y: head.y },
];

/** One step `direction`: the head moves on, and the tail follows unless it grows. */
export const step = (
  body: Body,
  direction: Direction,
  grows: boolean,
): Body => [move(body[0], direction), ...(grows ? body : body.slice(0, -1))];

export const bitesItself = ([head, ...tail]: Body) =>
  tail.some((segment) => same(head, segment));

export const contains = (body: Body, position: Position) =>
  body.some((segment) => same(segment, position));
