import { describe, expect, it } from 'vitest';
import {
  isFiller,
  sentences,
  shortTime,
  trimmed,
  type Word,
} from '../words.ts';

const word = (text: string, start: number, end = start + 0.3): Word => ({
  text,
  start,
  end,
});

describe('isFiller', () => {
  it('knows the sounds that are not words, however spelt', () => {
    for (const text of [
      'um',
      'Uh,',
      'umm',
      'Uhm.',
      'er',
      'erm',
      'Ah',
      'hmm',
      'Mm',
      'mmm',
    ])
      expect(isFiller(text)).toBe(true);
    for (const text of ['a', 'I', 'and', 'mom', 'ahead', 'her'])
      expect(isFiller(text)).toBe(false);
  });
});

describe('sentences', () => {
  it('ends a sentence at . ? or !, numbered from 1', () => {
    const words = [
      word('Hi', 0),
      word('there.', 0.4),
      word('Ready?', 1),
      word('Go!"', 1.5),
      word('Now', 2),
    ];
    expect(sentences(words).map((s) => [s.n, s.text, s.from, s.to])).toEqual([
      [1, 'Hi there.', 0, 1],
      [2, 'Ready?', 2, 2],
      [3, 'Go!"', 3, 3],
      [4, 'Now', 4, 4],
    ]);
  });

  it('ends a sentence at a pause over 1.5 s', () => {
    const found = sentences([
      word('so', 0),
      word('then', 0.5),
      word('later', 2.5),
    ]);
    expect(found.map((s) => s.text)).toEqual(['so then', 'later']);
    expect(found[0]).toMatchObject({ start: 0, end: 0.8 });
  });

  it('ends a sentence at 40 words', () => {
    const words = Array.from({ length: 90 }, (_, i) => word('and', i * 0.4));
    expect(sentences(words).map((s) => s.to - s.from + 1)).toEqual([
      40, 40, 10,
    ]);
  });
});

describe('shortTime', () => {
  const map = shortTime([
    { start: 1, end: 3 },
    { start: 10, end: 12 },
  ]);

  it('maps a kept moment to the short video', () => {
    expect(map(2)).toBe(1);
    expect(map(10.5)).toBe(2.5);
  });

  it('puts a removed moment where its cut is', () => {
    expect(map(0)).toBe(0);
    expect(map(5)).toBe(2);
    expect(map(99)).toBe(4);
  });
});

describe('trimmed', () => {
  it('keeps the words that stay, at times of the short video, numbered again', () => {
    const words = [
      word('Hello', 1),
      word('um', 1.5),
      word('world.', 2),
      word('Buy', 5),
      word('this.', 5.5),
      word('Bye.', 10),
    ];
    const all = sentences(words);
    const kept = [
      { start: 0.9, end: 2.4 },
      { start: 9.9, end: 10.4 },
    ];
    const found = trimmed(words, all, kept, new Set([2]));
    expect(found.map((s) => [s.n, s.text])).toEqual([
      [1, 'Hello world.'],
      [2, 'Bye.'],
    ]);
    expect(found[0]!.start).toBeCloseTo(0.1);
    expect(found[1]!.start).toBeCloseTo(1.6);
    expect(found[1]!.original).toBe(10);
  });
});
