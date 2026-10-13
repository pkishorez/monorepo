import { describe, expect, it } from 'vitest';

import { computeRanks, layoutRanks } from './rank-layout';

const item = (key: string) => ({ key, width: 100, height: 50 });
const spacing = { rank: 40, row: 10, column: 10 };

describe('computeRanks', () => {
  it('puts what nothing imports on top and each import one rank lower', () => {
    const ranks = computeRanks(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['a', 'c'],
      ],
    );
    expect([...ranks]).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 0],
    ]);
  });

  it('survives a loop', () => {
    const ranks = computeRanks(
      ['a', 'b'],
      [
        ['a', 'b'],
        ['b', 'a'],
      ],
    );
    expect([...ranks.keys()].sort()).toEqual(['a', 'b']);
    expect(ranks.get('a')).not.toBe(ranks.get('b'));
  });
});

describe('layoutRanks', () => {
  it('stacks ranks top to bottom with the rank gap between them', () => {
    const laid = layoutRanks([item('a'), item('b')], [['a', 'b']], spacing);
    expect(laid.rows).toEqual([['a'], ['b']]);
    expect(laid.placements).toEqual([
      { key: 'a', x: 0, y: 0, rank: 0 },
      { key: 'b', x: 0, y: 90, rank: 1 },
    ]);
    expect(laid.width).toBe(100);
    expect(laid.height).toBe(140);
  });

  it('wraps a wide rank into rows toward a square block', () => {
    const laid = layoutRanks(
      ['a', 'b', 'c', 'd', 'e', 'f'].map(item),
      [],
      spacing,
    );
    // Six 100×50 cards: two columns make 210×170, nearer a square than
    // one row (650×50) or three columns (320×110).
    expect(laid.rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
    expect(laid.width).toBe(210);
    expect(laid.height).toBe(170);
  });

  it('centres a short row under the widest one', () => {
    const laid = layoutRanks(
      [item('a'), item('b'), item('c')],
      [
        ['a', 'c'],
        ['b', 'c'],
      ],
      spacing,
    );
    expect(laid.placements.find(({ key }) => key === 'c')).toEqual({
      key: 'c',
      x: 55,
      y: 90,
      rank: 1,
    });
  });

  it('is empty for no items', () => {
    const laid = layoutRanks([], [], spacing);
    expect(laid).toEqual({ placements: [], rows: [], width: 0, height: 0 });
  });
});
