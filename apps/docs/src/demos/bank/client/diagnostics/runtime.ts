import { Effect, References } from 'effect';
import {
  makeTraceRecorder,
  type TraceRecorder,
} from '@pkishorez/effect-tracer/recorder';

export interface BankRunner {
  readonly runPromise: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
  readonly runSync: <A, E>(effect: Effect.Effect<A, E>) => A;
}

const quiet = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Effect.provideService(effect, References.MinimumLogLevel, 'Warning');

/** Runs effects without info-level chatter — for booting, before the recorder exists. */
export const quietRunner: BankRunner = {
  runPromise: (effect) => Effect.runPromise(quiet(effect)),
  runSync: (effect) => Effect.runSync(quiet(effect)),
};

export interface Tracing {
  readonly recorder: TraceRecorder;
  readonly runner: BankRunner;
}

/** Runs effects through a trace recorder so every flow shows up in the DevTools panel. */
export const makeTracing = (): Tracing => {
  const recorder = makeTraceRecorder();
  const record = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
    effect.pipe(
      Effect.provide(recorder.layer),
      Effect.provideService(References.MinimumLogLevel, 'Info'),
    );
  return {
    recorder,
    runner: {
      runPromise: (effect) => Effect.runPromise(record(effect)),
      runSync: (effect) => Effect.runSync(record(effect)),
    },
  };
};
