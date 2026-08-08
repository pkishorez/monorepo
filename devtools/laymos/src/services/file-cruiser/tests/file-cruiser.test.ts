import { fileURLToPath } from 'node:url';

import { Effect } from 'effect';
import { describe, expect, test } from 'vitest';

import { Cruiser, CruiserLive } from '../index.js';

function fixture(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

function cruise(name: string, ignoredPaths?: readonly string[]) {
  return Effect.gen(function* () {
    const cruiser = yield* Cruiser;
    return yield* cruiser.cruise(fixture(name), ['.'], ignoredPaths);
  }).pipe(Effect.provide(CruiserLive), Effect.runPromise);
}

describe('Cruiser', () => {
  test('follows type-only imports and re-exports', async () => {
    const actual = await cruise('basic-imports');

    expect(actual).toEqual(
      new Map([
        ['a.ts', ['b.ts']],
        ['b.ts', []],
        ['c.ts', ['b.ts']],
        ['docs/example.ts', ['b.ts']],
      ]),
    );
  });

  test('excludes builtin, third-party, and ignored imports', async () => {
    const actual = await cruise('excluded-imports', ['vendor']);

    expect(actual.get('a.ts')).toEqual([]);
    expect(actual.has('vendor/helper.ts')).toBe(false);
  });

  test('collects every import from a file that imports several others', async () => {
    const actual = await cruise('multiple-imports');

    expect(actual.get('a.ts')).toEqual(['b.ts', 'c.ts', 'd.ts']);
  });

  test('handles two files that import each other', async () => {
    const actual = await cruise('circular-imports');

    expect(actual).toEqual(
      new Map([
        ['a.ts', ['b.ts']],
        ['b.ts', ['a.ts']],
      ]),
    );
  });
});
