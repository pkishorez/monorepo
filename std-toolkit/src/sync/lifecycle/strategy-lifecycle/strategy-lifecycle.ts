import { Duration, Effect, Schedule, Scope } from 'effect';
import type {
  Leadership,
  LeadershipIdentity,
} from '../../runtime/leadership/index.js';

export const superviseStrategy = <A, E, R, RReport>(args: {
  leadership: Leadership;
  identity: LeadershipIdentity;
  run: (scope: Scope.Scope) => Effect.Effect<A, E, Scope.Scope | R>;
  onError: (error: E) => Effect.Effect<void, never, RReport>;
  onDefect?: (defect: unknown) => Effect.Effect<void, never, RReport>;
}): Effect.Effect<never, E, R | RReport> =>
  args.leadership
    .run(
      args.identity,
      Effect.scoped(
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          yield* args.run(scope);
        }),
      ).pipe(Effect.andThen(Effect.never)),
    )
    .pipe(
      Effect.tapError(args.onError),
      args.onDefect ? Effect.tapDefect(args.onDefect) : (effect) => effect,
      Effect.retry(
        Schedule.spaced(Duration.seconds(2)).pipe(Schedule.jittered),
      ),
    );
