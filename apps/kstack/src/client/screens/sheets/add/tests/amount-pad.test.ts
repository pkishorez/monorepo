import { describe, expect, it } from 'vitest';
import { centsOf } from '../../../../../domain/ledger/index.ts';
import { type PadKey, press } from '../amount-pad.tsx';

const typing = (keys: ReadonlyArray<PadKey>) =>
  keys.reduce((typed, key) => press(typed, key), '');

describe('the Amount Pad', () => {
  it('types an amount centsOf reads', () => {
    const typed = typing(['1', '2', '.', '5']);
    expect(typed).toBe('12.5');
    expect(centsOf(typed)).toBe(1250);
  });

  it('keeps one point, two decimals and no leading zero', () => {
    expect(typing(['.', '.', '5', '0', '9'])).toBe('0.50');
    expect(typing(['0', '0', '7'])).toBe('7');
    expect(typing(['0', '.', '0', '5'])).toBe('0.05');
  });

  it('stops at seven whole digits', () => {
    expect(typing(['1', '2', '3', '4', '5', '6', '7', '8'])).toBe('1234567');
  });

  it('takes back the last key', () => {
    expect(typing(['4', '.', '2', 'back', 'back'])).toBe('4');
    expect(typing(['back'])).toBe('');
  });
});
