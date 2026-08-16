import { Effect, Exit, Fiber, Scope } from 'effect';
import type {
  SingleItemStrategy,
  StrategyContext,
} from '../../runtime/strategy-runtime/index.js';
import { superviseStrategy } from '../strategy-lifecycle/index.js';
import {
  Activation,
  type FlowParticipant,
} from '../../runtime/sync-flow/index.js';
import type {
  Leadership,
  LeadershipIdentity,
} from '../../runtime/leadership/index.js';

export const startSingleItemLifecycle = <
  TItem extends object,
  TState,
  R,
>(args: {
  leadership: Leadership;
  identity: LeadershipIdentity;
  strategy: SingleItemStrategy<TItem, TState, R>;
  flow: FlowParticipant;
  makeContext: (
    scope: Scope.Scope,
    flow: FlowParticipant,
  ) => StrategyContext<TItem, TState>;
  onError: (error: unknown) => Effect.Effect<void, never, R>;
  onDefect: (defect: unknown) => Effect.Effect<void, never, R>;
}): Effect.Effect<{ close: Effect.Effect<void> }, never, R> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const activation = yield* args.flow.activation.start('Sync lifecycle');
    yield* args.flow.log('Single-item sync start', {
      attributes: { strategy: args.strategy.name },
    });
    const guarded = superviseStrategy({
      leadership: args.leadership,
      identity: args.identity,
      run: (attemptScope) =>
        args.strategy.run(args.makeContext(attemptScope, args.flow)).pipe(
          args.flow.withSpan('Strategy attempt', {
            attributes: { strategy: args.strategy.name },
          }),
          Effect.tap(() => args.flow.log('Strategy success')),
        ),
      onError: (error) =>
        args.flow
          .log('Strategy failure', {
            attributes: { cause: String(error), strategy: args.strategy.name },
            level: 'error',
          })
          .pipe(Effect.andThen(args.onError(error))),
      onDefect: (defect) =>
        args.flow
          .log('Strategy defect', {
            attributes: {
              cause: String(defect),
              strategy: args.strategy.name,
            },
            level: 'error',
          })
          .pipe(Effect.andThen(args.onDefect(defect))),
    });
    const fiber = yield* Effect.forkIn(guarded, scope);
    return {
      close: Effect.gen(function* () {
        yield* Fiber.interrupt(fiber);
        yield* Scope.close(scope, Exit.void);
        yield* activation.end(Activation.completed());
      }),
    };
  });
