// Runs a program against `Pwa.layer` with a fake clock, as one page load.
import * as Effect from 'effect/Effect';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import * as TestClock from 'effect/testing/TestClock';
import { Pwa } from '../src/client/index.js';
import type { ClientBuildInfo } from '../src/shared/config/index.js';

export const config = (
  overrides: Partial<ClientBuildInfo> = {},
): ClientBuildInfo => ({
  enabled: true,
  swUrl: '/sw.js',
  scope: '/',
  update: { checkIntervalMinutes: 60 },
  buildId: null,
  manifestUrl: '/manifest.webmanifest',
  appleTouchIconUrl: null,
  ...overrides,
});

export const run = <A>(
  program: Effect.Effect<A, never, Pwa>,
  info: ClientBuildInfo = config(),
) =>
  Effect.runPromise(
    program.pipe(
      Effect.provide(Pwa.layer(info)),
      Effect.provide(TestClock.layer()),
    ),
  );

export const statusTag = Effect.gen(function* () {
  const pwa = yield* Pwa;
  return (yield* SubscriptionRef.get(pwa.status))._tag;
});
