import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBrowser } from '../../../../../test/pwa/fake-browser.js';
import { DisplayMode } from '../index.js';

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

describe('DisplayMode', () => {
  it('follows display-mode media queries', async () => {
    const modes = await run(
      Effect.gen(function* () {
        const { mode } = yield* DisplayMode;
        const before = yield* SubscriptionRef.get(mode);
        browser.setDisplayMode('window-controls-overlay');
        return [before, yield* SubscriptionRef.get(mode)];
      }),
      DisplayMode.layer,
    );
    expect(modes).toEqual(['browser', 'window-controls-overlay']);
  });
});
