import { describe, expect, test } from 'vitest';

import { cycleLinks } from '../package-cycles.js';

describe('Package cycles', () => {
  test('cycleLinks closes each cycle, by where each member is placed', () => {
    const place = (name: string) =>
      ({ a: 'packages/a', b: 'apps/b' })[name] as string | undefined;
    expect(cycleLinks([['a', 'b']], place)).toEqual([
      ['packages/a', 'apps/b'],
      ['apps/b', 'packages/a'],
    ]);
  });
});
