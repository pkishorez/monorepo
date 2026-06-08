import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { makeManager } from '../manager/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.join(here, 'fixtures', 'sample-pkg');

describe('VitestRuntimeManager', () => {
  it(
    'boots once per package and reuses the cached runtime',
    () =>
      Effect.gen(function* () {
        const manager = yield* makeManager(Infinity);
        const first = yield* manager.get(pkgDir);
        const second = yield* manager.get(pkgDir);
        expect(first.bootCount).toBe(1);
        expect(second.bootCount).toBe(1);
        expect(second.vitest).toBe(first.vitest);
      }).pipe(Effect.scoped, Effect.runPromise),
    60_000,
  );

  it(
    're-boots after the runtime is idle-evicted',
    () =>
      Effect.gen(function* () {
        const manager = yield* makeManager(10);
        const first = yield* manager.get(pkgDir);
        expect(first.bootCount).toBe(1);
        yield* Effect.sleep('60 millis');
        const second = yield* manager.get(pkgDir);
        expect(second.bootCount).toBe(2);
      }).pipe(Effect.scoped, Effect.runPromise),
    60_000,
  );
});
