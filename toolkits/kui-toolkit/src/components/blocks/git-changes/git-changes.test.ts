import { describe, expect, test } from 'vitest';

import { changedPathsUnder, rollUpChanges } from './git-changes';

describe('rollUpChanges', () => {
  const membership = new Map([
    ['a/one.ts', 'a'],
    ['a/two.ts', 'a'],
    ['b/one.ts', 'b'],
    ['c/one.ts', 'c'],
  ]);

  test('an owner is added only when every file it owns is added', () => {
    const actual = rollUpChanges(
      membership,
      new Map([
        ['a/one.ts', 'added'],
        ['b/one.ts', 'added'],
      ]),
    );

    expect(actual.get('a')).toBe('modified');
    expect(actual.get('b')).toBe('added');
    expect(actual.has('c')).toBe(false);
  });

  test('ignores changed files no owner owns', () => {
    const actual = rollUpChanges(membership, new Map([['README.md', 'added']]));

    expect(actual.size).toBe(0);
  });
});

describe('changedPathsUnder', () => {
  test('selects the changed paths beneath a prefix, not its namesakes', () => {
    const actual = changedPathsUnder(
      new Map([
        ['src/a/one.ts', 'modified'],
        ['src/ab/other.ts', 'added'],
        ['src/b/one.ts', 'added'],
      ]),
      'src/a',
    );

    expect([...actual]).toEqual([['src/a/one.ts', 'modified']]);
  });
});
