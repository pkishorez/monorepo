import { Duration, Effect, Schedule, Scope } from 'effect';
import type {
  Leadership,
  LeadershipIdentity,
  LeadershipObserver,
} from '../../platform/leadership/index.js';
import type { StrategyFlow } from '../sync-flow/index.js';
import type { LeadershipState } from '../../domain/sync-event/index.js';

export const superviseStrategy = <A, E, R, RReport>(args: {
  leadership: Leadership;
  identity: LeadershipIdentity;
  flow?: StrategyFlow;
  run: (scope: Scope.Scope) => Effect.Effect<A, E, Scope.Scope | R>;
  onError: (error: E) => Effect.Effect<void, never, RReport>;
  onDefect?: (defect: unknown) => Effect.Effect<void, never, RReport>;
  onLeadership?: (
    state: LeadershipState,
  ) => Effect.Effect<void, never, RReport>;
}): Effect.Effect<never, E, R | RReport> =>
  Effect.flatMap(Effect.context<RReport>(), (context) => {
    const transition = (message: string, state: LeadershipState) =>
      Effect.all(
        [
          args.flow
            ? args.flow.log(message, {
                attributes: {
                  leadership: state,
                  leadershipIdentity: args.identity,
                },
              })
            : Effect.void,
          args.onLeadership?.(state) ?? Effect.void,
        ],
        { discard: true },
      ).pipe(Effect.provide(context));
    const observer: LeadershipObserver = {
      requested: transition('Leadership requested', 'waiting'),
      acquired: transition('Leadership acquired', 'leading'),
      released: transition('Leadership released', 'released'),
    };

    return args.leadership
      .run(
        args.identity,
        Effect.scoped(
          Effect.gen(function* () {
            const scope = yield* Effect.scope;
            yield* args.run(scope);
          }),
        ).pipe(Effect.andThen(Effect.never)),
        observer,
      )
      .pipe(
        Effect.tapError(args.onError),
        args.onDefect ? Effect.tapDefect(args.onDefect) : (effect) => effect,
        Effect.retry(
          Schedule.spaced(Duration.seconds(2)).pipe(Schedule.jittered),
        ),
      );
  });
