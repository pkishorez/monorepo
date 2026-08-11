import { Effect, Exit, Fiber, Scope } from 'effect';
import type {
  SingleItemStrategy,
  StrategyContext,
} from '../../runtime/strategy-runtime/index.js';
import { superviseStrategy } from '../strategy-lifecycle/index.js';

export const startSingleItemLifecycle = <
  TItem extends object,
  TState,
  R,
>(args: {
  strategy: SingleItemStrategy<TItem, TState, R>;
  makeContext: (scope: Scope.Scope) => StrategyContext<TItem, TState>;
  onError: (error: unknown) => Effect.Effect<void, never, R>;
}): Effect.Effect<{ close: Effect.Effect<void> }, never, R> =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const guarded = superviseStrategy({
      run: (attemptScope) => args.strategy.run(args.makeContext(attemptScope)),
      onError: args.onError,
    });
    const fiber = yield* Effect.forkIn(guarded, scope);
    return {
      close: Effect.gen(function* () {
        yield* Fiber.interrupt(fiber);
        yield* Scope.close(scope, Exit.void);
      }),
    };
  });
