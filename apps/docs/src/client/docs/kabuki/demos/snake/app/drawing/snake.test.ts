import { describe, expect, it } from 'vitest';
import { CELL, routeOf } from './snake.tsx';

/** A quarter circle of half a cell's radius. */
const QUARTER = (Math.PI * CELL) / 4;

describe('the track as one path', () => {
  it('runs straight through the middle of each cell, a cell apart', () => {
    const { d, along } = routeOf([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(d).not.toContain('A');
    expect(along).toEqual([0, CELL, 2 * CELL]);
  });

  it('rounds a turn into a quarter circle through its cell', () => {
    const { d, along } = routeOf([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(d.match(/A/g)).toHaveLength(1);
    // Half a cell in, the quarter circle, half a cell out.
    expect(along.at(-1)).toBeCloseTo(CELL + QUARTER, 5);
  });

  it('leaves the head’s cell square until the head moves on', () => {
    const { d } = routeOf([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(d.match(/A/g)).toHaveLength(1);
  });
});
