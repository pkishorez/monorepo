import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { runPackageOnce } from '../index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.join(
  here,
  '..',
  '..',
  'runtime',
  '__tests__',
  'fixtures',
  'sample-pkg',
);

describe('runPackageOnce', () => {
  it(
    'runs the documented suite once and reports each test by identity',
    () =>
      Effect.gen(function* () {
        const records = yield* runPackageOnce(pkgDir);
        const byName = new Map(records.map((r) => [r.name, r]));

        expect(byName.size).toBe(5);

        const render = byName.get('renders a widget');
        expect(render?.feature).toBe('widgets');
        expect(render?.groupId).toBe('render');
        expect(render?.status).toBe('pass');

        expect(byName.get('accepts a valid widget')?.status).toBe('pass');
        expect(byName.get('handles legacy widgets')?.status).toBe('skip');

        const started = byName.get('starts cleanly');
        expect(started?.feature).toBe('gadgets');
        expect(started?.groupId).toBe('run');
        expect(started?.status).toBe('pass');
      }).pipe(Effect.runPromise),
    60_000,
  );

  it(
    'surfaces a failing documented test with a non-empty error',
    () =>
      Effect.gen(function* () {
        const records = yield* runPackageOnce(pkgDir);
        const failing = records.find(
          (r) => r.name === 'rejects an empty widget',
        );
        expect(failing?.status).toBe('fail');
        expect(failing?.error).toBeTruthy();
      }).pipe(Effect.runPromise),
    60_000,
  );
});
