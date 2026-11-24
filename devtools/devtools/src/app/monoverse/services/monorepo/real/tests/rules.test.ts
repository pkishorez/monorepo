import { describe, expect, test } from 'vitest';

import { isViolation, violationsOf } from '../rules.js';

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
