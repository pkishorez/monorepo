/** The way a touch first moves: whichever of the four it moved most. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** The Directions a listener takes touches in; `'all'` for any of them. */
export type Directions = 'all' | ReadonlyArray<Direction>;

/**
 * How far a pointer moves, in px, before its Direction is read, when no
 * touch event reads it first, such as for a pen.
 */
export const SLOP = 10;

/** The Direction of a movement by dx, dy; none before it has moved. */
export const directionOf = (dx: number, dy: number): Direction | undefined => {
  'worklet';
  if (dx === 0 && dy === 0) return undefined;
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'up' : 'down';
  return dx < 0 ? 'left' : 'right';
};

/** Whether `wanted` takes touches in `direction`. */
export const wants = (
  wanted: Directions | undefined,
  direction: Direction | undefined,
) => {
  'worklet';
  return (
    direction !== undefined &&
    (wanted === 'all' || (wanted?.includes(direction) ?? false))
  );
};
