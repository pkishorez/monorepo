import { describe, expect, it } from 'vitest';
import { skillChange } from './slash.ts';

const put = (text: string, at: number, typed: boolean, to = at) => {
  const {
    from,
    to: end,
    insert,
  } = skillChange(text, 'review', {
    from: at,
    to,
    typed,
  });
  return `${text.slice(0, from)}${insert}${text.slice(end)}`;
};

describe('skillChange', () => {
  it('takes the place of the `/` typed just before the cursor', () => {
    expect(put('fix /', 5, true)).toBe('fix /review ');
    expect(put('/ it', 1, true)).toBe('/review it');
  });

  it('goes in at the cursor when no `/` was typed, apart from the word before', () => {
    expect(put('fix it', 6, false)).toBe('fix it /review ');
    expect(put('fix it', 0, false)).toBe('/review fix it');
  });

  it('goes in at the cursor when the `/` is gone', () => {
    expect(put('fix ', 4, true)).toBe('fix /review ');
  });

  it('replaces the selection', () => {
    expect(put('fix this now', 4, false, 8)).toBe('fix /review now');
  });
});
