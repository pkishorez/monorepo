import { describe, expect, it } from 'vite-plus/test';
import { tameWordEnds } from '../src/engine/session/word-times.ts';

describe('tameWordEnds', () => {
  const options = { windowEnd: 5, maxWordSeconds: 1 };

  it('pulls an end back to the next word start', () => {
    const [a, b] = tameWordEnds(
      [
        { text: 'a', start: 1, end: 2.5 },
        { text: 'b', start: 1.4, end: 1.9 },
      ],
      options,
    );
    expect(a!.end).toBe(1.4);
    expect(b!.end).toBe(1.9);
  });

  it('caps the last word at the window end and the longest word', () => {
    const [long, tail] = tameWordEnds(
      [
        { text: 'long', start: 1, end: 9 },
        { text: 'tail', start: 4.5, end: 21 },
      ],
      options,
    );
    expect(long!.end).toBe(2);
    expect(tail!.end).toBe(5);
  });

  it('keeps every word at least a sliver long', () => {
    const [w] = tameWordEnds([{ text: 'w', start: 3, end: 1 }], options);
    expect(w!.end).toBeCloseTo(3.05);
  });

  it('drops words that start in the padding past the window end', () => {
    const words = tameWordEnds(
      [
        { text: 'real', start: 4, end: 4.5 },
        { text: 'ghost', start: 29.5, end: 29.9 },
      ],
      options,
    );
    expect(words.map((w) => w.text)).toEqual(['real']);
  });
});
