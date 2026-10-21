import { Effect, Exit, Scope, Semaphore } from 'effect';
import type { HarnessError, HarnessSession } from '../../../harness/index.js';

/*
 * A Session's agent, opened on first use and kept open for the turns after.
 * It lives in a Scope of its own inside the Session's, so a reset closes
 * just the agent and the next use opens it again, and the Session stopping
 * closes it with everything else. An open that fails leaves nothing open.
 */
export const makeAgent = (
  open: Effect.Effect<HarnessSession, HarnessError, Scope.Scope>,
) =>
  Effect.gen(function* () {
    const outer = yield* Effect.scope;
    const lock = yield* Semaphore.make(1);
    let current:
      | { readonly session: HarnessSession; readonly scope: Scope.Closeable }
      | undefined;

    const get = lock.withPermits(1)(
      Effect.suspend(() => {
        if (current) return Effect.succeed(current.session);
        return Effect.gen(function* () {
          const scope = yield* Scope.fork(outer);
          const session = yield* Scope.provide(open, scope).pipe(
            Effect.onError(() => Scope.close(scope, Exit.void)),
          );
          current = { session, scope };
          return session;
        });
      }),
    );

    const reset = lock.withPermits(1)(
      Effect.suspend(() => {
        const closing = current;
        current = undefined;
        return closing ? Scope.close(closing.scope, Exit.void) : Effect.void;
      }),
    );

    return {
      get,
      opened: Effect.sync(() => current?.session),
      reset,
    };
  });
