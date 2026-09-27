import { Deferred, Effect, Ref } from 'effect';

export type InteractionKind = 'permission' | 'question';

export interface AskOptions<A> {
  readonly kind: InteractionKind;
  /** Writes the Interaction Request once it is registered as pending. */
  readonly emit: () => void;
  readonly timeoutMs: number;
  readonly timeoutAnswer: A;
  readonly cancelAnswer: A;
  readonly onResolved?: (answer: A) => void;
}

export interface MailboxPending {
  readonly requestId: string;
  readonly kind: InteractionKind;
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
  onPendingChange: (
    pending: ReadonlyArray<MailboxPending>,
  ) => Effect.Effect<void> = () => Effect.void,
): Effect.Effect<Mailbox<A>> =>
  Effect.gen(function* () {
    const state = yield* Ref.make(new Map<string, PendingEntry<A>>());
    const completed = yield* Ref.make(new Set<string>());

    const snapshot = Ref.get(state).pipe(
      Effect.map((pending) =>
        [...pending.values()].map(({ requestId, kind, createdAt }) => ({
          requestId,
          kind,
          createdAt,
        })),
      ),
    );

    const notify = Effect.flatMap(snapshot, onPendingChange);

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

          yield* notify;
          options.emit();
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
          options.onResolved?.(answer);
          yield* notify;
          return answer;
        }),
      resolve,
      resolveAll: Effect.gen(function* () {
        const pending = yield* Ref.getAndSet(state, new Map());
        yield* Effect.forEach(pending.values(), (entry) =>
          Deferred.succeed(entry.deferred, entry.cancelAnswer),
        );
        yield* onPendingChange([]);
      }),
      pending: snapshot,
    };
  });
