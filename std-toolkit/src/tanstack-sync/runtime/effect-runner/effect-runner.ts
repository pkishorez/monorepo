import { Effect, ManagedRuntime } from 'effect';

export type EffectRuntime<R> = Pick<
  ManagedRuntime.ManagedRuntime<R, unknown>,
  'runPromise' | 'runSync'
>;

export type EffectRunner<R> = {
  runPromise: <A, E>(effect: Effect.Effect<A, E, R>) => Promise<A>;
  runSync: <A, E>(effect: Effect.Effect<A, E, R>) => A;
};

export const makeEffectRunner = <R>(
  runtime: EffectRuntime<R> | undefined,
): EffectRunner<R> => {
  if (runtime) {
    return {
      runPromise: (effect) => runtime.runPromise(effect),
      runSync: (effect) => runtime.runSync(effect),
    };
  }

  return {
    runPromise: (effect) =>
      Effect.runPromise(effect as Effect.Effect<unknown, unknown, never>),
    runSync: (effect) =>
      Effect.runSync(effect as Effect.Effect<unknown, unknown, never>),
  } as EffectRunner<R>;
};
