import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Option from 'effect/Option';
import { KeepAlive } from '../global-scope/index.js';

/**
 * Network, falling back when the network fails or is slower than `timeoutMs`.
 * On a timeout with nothing to fall back to, it keeps waiting for the network.
 * A timed-out network call keeps running in the background (kept alive), so
 * whatever it does on success, such as updating a cache, still happens.
 */
export const networkFirst = <R>(options: {
  readonly network: Effect.Effect<Response, Error, R>;
  readonly fallback: Effect.Effect<Option.Option<Response>, never, R>;
  readonly timeoutMs: number | undefined;
}): Effect.Effect<Response, Error, R | KeepAlive> =>
  Effect.gen(function* () {
    const { network, fallback, timeoutMs } = options;
    const orFail = (error: Error) =>
      Effect.flatMap(
        fallback,
        Option.match({
          onNone: () => Effect.fail(error),
          onSome: Effect.succeed,
        }),
      );
    if (timeoutMs === undefined) {
      return yield* Effect.catch(network, orFail);
    }
    const fiber = yield* Effect.forkDetach(network);
    const first = yield* Fiber.join(fiber).pipe(
      Effect.timeoutOption(timeoutMs),
      Effect.catch((error) => Effect.map(orFail(error), Option.some)),
    );
    if (Option.isSome(first)) return first.value;
    (yield* KeepAlive)(fiber);
    const cached = yield* fallback;
    if (Option.isSome(cached)) return cached.value;
    return yield* Fiber.join(fiber);
  });
