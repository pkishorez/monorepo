import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Option from 'effect/Option';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBrowser } from '../../../../test/fake-browser.js';
import { StoragePersistence } from '../index.js';

// Each run builds a fresh service, as a fresh page would.
const run = <A, E, R>(program: Effect.Effect<A, E, R>, layer: Layer.Layer<R>) =>
  Effect.runPromise(
    Effect.scoped(program.pipe(Effect.provide(layer))) as Effect.Effect<A, E>,
  );

let browser: FakeBrowser;
beforeEach(() => {
  browser = new FakeBrowser();
  browser.install();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StoragePersistence', () => {
  it('is none without the Storage API', async () => {
    const result = await run(
      Effect.flatMap(StoragePersistence, (s) => s.persisted),
      StoragePersistence.layer,
    );
    expect(result).toEqual(Option.none());
  });

  it('reads persisted, persist and estimate', async () => {
    browser.navigator['storage'] = {
      persisted: async () => false,
      persist: async () => true,
      estimate: async () => ({ usage: 10 }),
    };
    const result = await run(
      Effect.gen(function* () {
        const storage = yield* StoragePersistence;
        return [
          yield* storage.persisted,
          yield* storage.persist,
          yield* storage.estimate,
        ];
      }),
      StoragePersistence.layer,
    );
    expect(result).toEqual([
      Option.some(false),
      Option.some(true),
      Option.some({ usage: 10, quota: 0 }),
    ]);
  });
});
