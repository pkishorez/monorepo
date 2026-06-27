import { Duration, Effect, Result, Schedule, Stream } from 'effect';
import type { EntityType } from 'std-toolkit/core';
import { FinancesClient, financesRuntime } from '../effect';

const toObservableError = (error: unknown): Error =>
  error instanceof Error
    ? error
    : new Error(typeof error === 'string' ? error : JSON.stringify(error));

export const run = <A>(
  eff: Effect.Effect<A, unknown, FinancesClient>,
): Effect.Effect<A> =>
  Effect.promise(async () => {
    const result = await financesRuntime.runPromise(Effect.result(eff));
    if (Result.isFailure(result)) throw toObservableError(result.failure);
    return result.success;
  });

type StreamMessage<T> =
  | { readonly _tag: 'batch'; readonly items: readonly T[] }
  | { readonly _tag: 'initial-sync-done' }
  | { readonly _tag: 'heartbeat' };

const reconnectSchedule = Schedule.spaced(Duration.seconds(2));

// terminal errors become Stream.empty so the strategy can restart from the persisted cursor
export const streamSource =
  <T>(
    open: (
      cursor: string | null,
    ) => Effect.Effect<
      Stream.Stream<StreamMessage<EntityType<T>>, unknown, never>,
      unknown,
      FinancesClient
    >,
  ) =>
  (ctx: {
    cursor: EntityType<T> | null;
  }): Effect.Effect<Stream.Stream<EntityType<T>[]>> =>
    Effect.succeed(
      Stream.unwrap(run(open(ctx.cursor?.meta._u ?? null))).pipe(
        Stream.filterMap((message) =>
          message._tag === 'batch'
            ? Result.succeed(message.items.slice())
            : Result.fail(message),
        ),
        Stream.retry(reconnectSchedule),
        Stream.catchCause(() => Stream.empty),
      ),
    );
