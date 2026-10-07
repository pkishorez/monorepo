import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBrowser, fire } from '../../../../../test/pwa/fake-browser.js';
import { Online } from '../index.js';

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

describe('Online', () => {
  it('follows online and offline events', async () => {
    const values = await run(
      Effect.gen(function* () {
        const { online } = yield* Online;
        yield* fire(browser.window, 'offline');
        const offline = yield* SubscriptionRef.get(online);
        yield* fire(browser.window, 'online');
        return [offline, yield* SubscriptionRef.get(online)];
      }),
      Online.layer,
    );
    expect(values).toEqual([false, true]);
  });
});
