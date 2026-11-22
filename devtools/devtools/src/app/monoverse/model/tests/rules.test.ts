import { describe, expect, test } from 'vitest';

import { cycleLinks, findCycles, isViolation, violationsOf } from '../index.js';

describe('the rule: never import a file directly in an ancestor folder', () => {
  const from = 'src/app/lotel/feed/actor.ts';

  test.each([
    ['a file in the same folder', 'src/app/lotel/feed/view.tsx'],
    ['a file in a child folder', 'src/app/lotel/feed/rows/row.tsx'],
    ['a file in a child folder at any depth', 'src/app/lotel/feed/a/b/c/d.ts'],
    ['a file in a sibling folder', 'src/app/lotel/sessions/index.ts'],
    ['a file inside a sibling folder', 'src/app/lotel/sessions/deep/x.ts'],
    ['a file in a folder beside the parent', 'src/app/kabuki/index.ts'],
    ['a file in a folder beside a further ancestor', 'src/cli/main.ts'],
    ['a folder beside the root', 'scripts/dev.ts'],
  ])('%s is fine', (_, to) => {
    expect(isViolation(from, to)).toBe(false);
  });

  test.each([
    ['a file directly in the parent folder', 'src/app/lotel/actor.ts'],
    ['the door of the parent folder', 'src/app/lotel/index.ts'],
    ['a file directly in the grandparent folder', 'src/app/view.tsx'],
    ['a file directly in a further ancestor', 'src/index.ts'],
    ['a file directly in the root', 'vite.config.ts'],
  ])('%s is a Violation', (_, to) => {
    expect(isViolation(from, to)).toBe(true);
  });

  test('a file at the root may import its neighbours and anything below', () => {
    expect(isViolation('main.ts', 'util.ts')).toBe(false);
    expect(isViolation('main.ts', 'src/a.ts')).toBe(false);
  });

  test('violationsOf keeps only the imports that break it', () => {
    expect(
      violationsOf([
        ['a/b/c.ts', 'a/d.ts'],
        ['a/b/c.ts', 'a/b/e.ts'],
        ['a/b/c.ts', 'a/x/y.ts'],
      ]),
    ).toEqual([['a/b/c.ts', 'a/d.ts']]);
  });
});

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

  test('cycleLinks closes each cycle, by where each member is placed', () => {
    const place = (name: string) =>
      ({ a: 'packages/a', b: 'apps/b' })[name] as string | undefined;
    expect(cycleLinks([['a', 'b']], place)).toEqual([
      ['packages/a', 'apps/b'],
      ['apps/b', 'packages/a'],
    ]);
  });
});
