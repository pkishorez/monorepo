import { describe, expect, it } from 'vitest';
import { withSlash } from './slash.ts';

describe('withSlash', () => {
  it('takes the place of the `/` typed there', () => {
    expect(withSlash('fix /', 'review', 4, true)).toBe('fix /review ');
    expect(withSlash('/ it', 'review', 0, true)).toBe('/review it');
  });

  it('goes in at the cursor when no `/` was typed, apart from the word before', () => {
    expect(withSlash('fix it', 'review', 6, false)).toBe('fix it /review ');
    expect(withSlash('fix it', 'review', 0, false)).toBe('/review fix it');
  });

  it('puts it in at the place when the `/` is gone', () => {
    expect(withSlash('fix ', 'review', 4, true)).toBe('fix /review ');
  });
});
