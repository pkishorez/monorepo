import { Duration, Effect, Schedule, Scope } from 'effect';

export const superviseStrategy = <A, E, R, RReport>(args: {
  run: (scope: Scope.Scope) => Effect.Effect<A, E, Scope.Scope | R>;
  onError: (error: E) => Effect.Effect<void, never, RReport>;
  onDefect?: (defect: unknown) => Effect.Effect<void, never, RReport>;
}): Effect.Effect<A, E, R | RReport> =>
  Effect.scoped(
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      return yield* args.run(scope);
    }),
  ).pipe(
    Effect.tapError(args.onError),
    args.onDefect ? Effect.tapDefect(args.onDefect) : (effect) => effect,
    Effect.retry(Schedule.spaced(Duration.seconds(2))),
  );
