import { describe, expect, it } from 'vitest';
import { rowRead } from '../actor.ts';

/*
 * The header's rows, as Layout waits for them at each place: read for the
 * id the URL names, never the row of the place before, which its Query
 * still holds for a moment after the URL moved.
 */

describe("a header's row", () => {
  it('is read when none is named', () => {
    expect(rowRead(null, undefined)).toBe(true);
  });

  it('waits for its Query', () => {
    expect(rowRead('s1', undefined)).toBe(false);
    expect(
      rowRead('s1', { status: 'loading', asked: 's1', held: undefined }),
    ).toBe(false);
  });

  it('is read once its Query holds it, or holds none', () => {
    expect(rowRead('s1', { status: 'ready', asked: 's1', held: 's1' })).toBe(
      true,
    );
    expect(
      rowRead('s1', { status: 'ready', asked: 's1', held: undefined }),
    ).toBe(true);
  });

  it('is not the place before’s', () => {
    expect(rowRead('s2', { status: 'ready', asked: 's1', held: 's1' })).toBe(
      false,
    );
    expect(rowRead('s2', { status: 'ready', asked: 's2', held: 's1' })).toBe(
      false,
    );
  });
});
