import { Cause, Effect, Exit } from 'effect';
import type { Connectivity } from '../../domain/connectivity/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type {
  EntityBody,
  EntryStore,
  OutboxEntry,
  OutboxOutcome,
  QueueKey,
  Request,
} from '../entries/index.js';
import type { Handlers } from '../handlers/index.js';
import { narrateRequest, requestOutcome } from '../narration/index.js';
import { foldQueue } from './fold.js';

export type DrainerDeps<R = never> = {
  readonly entries: EntryStore;
  readonly handlers: Pick<Handlers, 'lookup'>;
  readonly connectivity: Connectivity;
  readonly awaitSignal: Effect.Effect<void>;
  readonly signal: () => void;
  readonly ring: (id: string, outcome: OutboxOutcome) => Effect.Effect<void>;
  readonly onRequestFailed?: (
    entries: ReadonlyArray<OutboxEntry>,
    cause: unknown,
  ) => Effect.Effect<void, never, R>;
};

const unsettled = (entries: ReadonlyArray<OutboxEntry>) =>
  entries.filter((entry) => entry.status !== 'failed');

export const runDrainer = <R = never>(
  deps: DrainerDeps<R>,
): Effect.Effect<void, WriteError, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const { entries, handlers, connectivity } = deps;
      const scope = yield* Effect.scope;
      const running = new Set<QueueKey>();
      const rerun = new Set<QueueKey>();

      yield* entries.resetInFlight();

      const send = (
        queue: QueueKey,
        group: ReadonlyArray<OutboxEntry>,
      ): Effect.Effect<Exit.Exit<void, unknown>> => {
        const head = group[0]!;
        const handler = handlers.lookup(head.name)!;
        const request: Request | null =
          handler.kind === 'entity'
            ? foldQueue(group.map((entry) => entry.body as EntityBody))
            : null;
        const sending: Effect.Effect<void, unknown> =
          handler.kind === 'entity'
            ? request!.op === 'nothing'
              ? Effect.void
              : handler.send(request!)
            : head.body.kind === 'action'
              ? handler.send(head.body.payload, head.id)
              : Effect.fail(
                  new Error(`[sync] entity Entry "${head.id}" on action queue`),
                );
        return narrateRequest(
          handler.flow ?? null,
          { queue, group, request },
          sending,
        );
      };

      const settle = (
        group: ReadonlyArray<OutboxEntry>,
        exit: Exit.Exit<void, unknown>,
      ): Effect.Effect<'continue' | 'wait', WriteError, R> =>
        Effect.gen(function* () {
          const ids = group.map((entry) => entry.id);
          switch (requestOutcome(exit)) {
            case 'delivered':
              yield* entries.remove(ids);
              yield* Effect.forEach(ids, (id) => deps.ring(id, 'delivered'));
              return 'continue';
            case 'interrupted':
              return 'wait';
            case 'unreachable':
              yield* entries.setStatus(ids, 'pending');
              return 'wait';
            case 'failed': {
              const cause = Exit.isFailure(exit)
                ? Cause.squash(exit.cause)
                : undefined;
              yield* entries.setStatus(ids, 'failed');
              yield* deps.onRequestFailed?.(group, cause) ?? Effect.void;
              yield* Effect.forEach(ids, (id) => deps.ring(id, 'failed'));
              return 'continue';
            }
          }
        });

      const work = (
        queue: QueueKey,
      ): Effect.Effect<'drained' | 'wait', WriteError, R> =>
        Effect.gen(function* () {
          while (connectivity.isOnline()) {
            const scanned = yield* entries.queue(queue);
            // Only this worker sends this Queue, so any in-flight Entry here is
            // the leftover of a worker that failed mid-way: take it back.
            const stale = scanned.filter(
              (entry) => entry.status === 'in-flight',
            );
            if (stale.length > 0) {
              yield* entries.setStatus(
                stale.map((entry) => entry.id),
                'pending',
              );
            }
            const found = unsettled(scanned);
            // No Handler in this tab: leave the Queue for a leader that has one.
            if (found.length === 0 || !handlers.lookup(found[0]!.name)) {
              return 'drained';
            }
            const group =
              found[0]!.body.kind === 'entity' ? found : [found[0]!];
            yield* entries.setStatus(
              group.map((entry) => entry.id),
              'in-flight',
            );
            const exit = yield* send(queue, group);
            if ((yield* settle(group, exit)) === 'wait') return 'wait';
          }
          return 'wait';
        });

      // One worker per Queue. A signal during a Request only flags a rerun,
      // so an unreachable Request is never retried by a worker queued behind it.
      const dispatch = (queue: QueueKey): Effect.Effect<void, never, R> =>
        Effect.gen(function* () {
          if (running.has(queue)) {
            rerun.add(queue);
            return;
          }
          running.add(queue);
          let outcome: 'drained' | 'wait' = 'wait';
          const worker = Effect.gen(function* () {
            do {
              rerun.delete(queue);
              outcome = yield* work(queue);
            } while (outcome === 'drained' && rerun.has(queue));
          }).pipe(
            Effect.catchCause((cause) =>
              Effect.logError('[sync] outbox queue worker failed', cause),
            ),
            Effect.ensuring(
              Effect.sync(() => {
                running.delete(queue);
                // A signal that landed after the last drained scan is not
                // lost; after a wait it is dropped, so an unreachable Request
                // is not retried until connectivity changes or the poll fires.
                if (rerun.delete(queue) && outcome === 'drained') deps.signal();
              }),
            ),
          );
          yield* Effect.forkIn(worker, scope);
        });

      while (true) {
        if (connectivity.isOnline()) {
          const queues = new Set(
            unsettled(yield* entries.list()).map((entry) => entry.queue),
          );
          yield* Effect.forEach(queues, dispatch, { discard: true });
        }
        yield* deps.awaitSignal;
      }
    }),
  );
