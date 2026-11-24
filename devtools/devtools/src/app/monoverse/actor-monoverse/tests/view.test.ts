import { describe, expect, it } from 'vitest';

import {
  placesAmongSiblings,
  rowsToDraw,
} from '../view/shared/virtual-rows.js';

const range = (startIndex: number, endIndex: number, count = 100) => ({
  startIndex,
  endIndex,
  overscan: 2,
  count,
});

describe('rowsToDraw', () => {
  it('draws the rows on screen and the overscan either side', () => {
    expect(rowsToDraw(range(10, 12), [])).toEqual([8, 9, 10, 11, 12, 13, 14]);
  });

  it('keeps the rows always drawn, in order, wherever the list is', () => {
    expect(rowsToDraw(range(10, 10), [90, 0, 11])).toEqual([
      0, 8, 9, 10, 11, 12, 90,
    ]);
  });

  it('leaves out kept rows the list no longer holds', () => {
    expect(rowsToDraw(range(0, 1, 3), [5, -1])).toEqual([0, 1, 2]);
  });
});

describe('placesAmongSiblings', () => {
  it('counts each row among the rows beside it, inside the same folder', () => {
    // a, a/x, a/x/1, a/y, b, b/z
    expect(placesAmongSiblings([0, 1, 2, 1, 0, 1])).toEqual([
      { position: 1, of: 2 },
      { position: 1, of: 2 },
      { position: 1, of: 1 },
      { position: 2, of: 2 },
      { position: 2, of: 2 },
      { position: 1, of: 1 },
    ]);
  });

  it('has nothing to count in an empty list', () => {
    expect(placesAmongSiblings([])).toEqual([]);
  });
});
