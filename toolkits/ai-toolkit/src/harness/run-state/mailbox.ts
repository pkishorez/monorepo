import { Deferred, Effect, Ref } from 'effect';

export interface AskOptions<A> {
  readonly kind: 'permission' | 'question';
  readonly emit: Effect.Effect<void, unknown>;
  readonly timeoutMs: number;
  readonly timeoutAnswer: A;
  readonly cancelAnswer: A;
  readonly onResolved?: (answer: A) => Effect.Effect<void, unknown>;
}

export interface MailboxPending {
  readonly requestId: string;
  readonly kind: 'permission' | 'question';
  readonly createdAt: number;
}

interface PendingEntry<A> extends MailboxPending {
  readonly deferred: Deferred.Deferred<A>;
  readonly cancelAnswer: A;
}

export interface Mailbox<A> {
  readonly ask: (
    requestId: string,
    options: AskOptions<A>,
  ) => Effect.Effect<A, unknown>;
  readonly resolve: (requestId: string, answer: A) => Effect.Effect<boolean>;
  readonly resolveAll: Effect.Effect<void>;
  readonly pending: Effect.Effect<ReadonlyArray<MailboxPending>>;
}

export const makeMailbox = <A>(
  onPendingChange: (pending: boolean) => Effect.Effect<void> = () =>
    Effect.void,
): Effect.Effect<Mailbox<A>> =>
  Effect.gen(function* () {
    const state = yield* Ref.make(new Map<string, PendingEntry<A>>());
    const completed = yield* Ref.make(new Set<string>());

    const resolve = (requestId: string, answer: A) =>
      Effect.gen(function* () {
        const deferred = yield* Ref.get(state).pipe(
          Effect.map((pending) => pending.get(requestId)?.deferred),
        );
        if (deferred === undefined) {
          return yield* Ref.get(completed).pipe(
            Effect.map((requests) => requests.has(requestId)),
          );
        }
        yield* Deferred.succeed(deferred, answer);
        yield* Ref.update(completed, (requests) => {
          const next = new Set(requests);
          next.add(requestId);
          return next;
        });
        return true;
      });

    return {
      ask: (requestId, options) =>
        Effect.gen(function* () {
          const deferred = yield* Deferred.make<A>();
          const inserted = yield* Ref.modify(state, (pending) => {
            if (pending.has(requestId)) return [false, pending] as const;
            const next = new Map(pending);
            next.set(requestId, {
              requestId,
              kind: options.kind,
              createdAt: Date.now(),
              deferred,
              cancelAnswer: options.cancelAnswer,
            });
            return [true, next] as const;
          });
          if (!inserted) {
            return yield* Effect.die(
              new Error(`Duplicate pending request: ${requestId}`),
            );
          }

          yield* onPendingChange(true);
          yield* options.emit;
          const answer = yield* Effect.raceFirst(
            Deferred.await(deferred),
            Effect.sleep(options.timeoutMs).pipe(
              Effect.as(options.timeoutAnswer),
            ),
          ).pipe(
            Effect.ensuring(
              Ref.update(state, (pending) => {
                const next = new Map(pending);
                next.delete(requestId);
                return next;
              }),
            ),
          );
          yield* Ref.update(completed, (requests) => {
            const next = new Set(requests);
            next.add(requestId);
            return next;
          });
          if (options.onResolved !== undefined) {
            yield* options.onResolved(answer);
          }
          const stillPending = yield* Ref.get(state).pipe(
            Effect.map((pending) => pending.size > 0),
          );
          yield* onPendingChange(stillPending);
          return answer;
        }),
      resolve,
      resolveAll: Effect.gen(function* () {
        const pending = yield* Ref.getAndSet(state, new Map());
        yield* Effect.forEach(pending.values(), (entry) =>
          Deferred.succeed(entry.deferred, entry.cancelAnswer),
        );
        yield* onPendingChange(false);
      }),
      pending: Ref.get(state).pipe(
        Effect.map((pending) =>
          [...pending.values()].map(({ requestId, kind, createdAt }) => ({
            requestId,
            kind,
            createdAt,
          })),
        ),
      ),
    };
  });
