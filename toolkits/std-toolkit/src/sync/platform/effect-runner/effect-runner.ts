import { Effect, ManagedRuntime } from 'effect';

export type EffectRuntime<R> = Pick<
  ManagedRuntime.ManagedRuntime<R, unknown>,
  'runPromise' | 'runSync'
> &
  Partial<Pick<ManagedRuntime.ManagedRuntime<R, unknown>, 'contextEffect'>>;

export type EffectRunner<R> = {
  runPromise: <A, E>(effect: Effect.Effect<A, E, R>) => Promise<A>;
  runSync: <A, E>(effect: Effect.Effect<A, E, R>) => A;
  provide: <A, E>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E>;
};

export const makeEffectRunner = <R>(
  runtime: EffectRuntime<R> | undefined,
): EffectRunner<R> => {
  if (runtime) {
    const contextEffect = runtime.contextEffect;
    return {
      runPromise: (effect) => runtime.runPromise(effect),
      runSync: (effect) => runtime.runSync(effect),
      // Without a context the effect hops through a promise and cannot be
      // interrupted; a ManagedRuntime keeps it in-fiber.
      provide: (effect) =>
        contextEffect
          ? (contextEffect.pipe(
              Effect.flatMap((context) => Effect.provide(effect, context)),
            ) as Effect.Effect<never, never>)
          : (Effect.promise(() => runtime.runPromise(effect)) as Effect.Effect<
              never,
              never
            >),
    };
  }

  return {
    runPromise: (effect) =>
      Effect.runPromise(effect as Effect.Effect<unknown, unknown, never>),
    runSync: (effect) =>
      Effect.runSync(effect as Effect.Effect<unknown, unknown, never>),
    provide: (effect) => effect,
  } as EffectRunner<R>;
};
