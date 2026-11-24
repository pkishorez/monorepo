import { describe, expect, test } from 'vitest';

import { findCycles } from '../index.js';

describe('Package cycles', () => {
  const graph = (edges: Record<string, Array<string>>) =>
    new Map(Object.entries(edges));

  test('finds none in an acyclic graph', () => {
    expect(findCycles(graph({ a: ['b'], b: ['c'], c: [] }))).toEqual([]);
  });

  test('finds each cycle once, from its alphabetically first member', () => {
    expect(
      findCycles(graph({ c: ['a'], a: ['b'], b: ['c'], d: ['d'] })),
    ).toEqual([['a', 'b', 'c'], ['d']]);
  });

  test('finds every elementary cycle through a shared member', () => {
    expect(findCycles(graph({ a: ['b', 'c'], b: ['a'], c: ['a'] }))).toEqual([
      ['a', 'b'],
      ['a', 'c'],
    ]);
  });
});
