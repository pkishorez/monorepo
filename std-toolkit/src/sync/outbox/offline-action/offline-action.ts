import { Duration, Effect, Schedule, Schema } from 'effect';
import { createOptimisticAction, type Transaction } from '@tanstack/react-db';
import { nextUlid } from '../../../core/index.js';
import {
  actionHandlerName,
  type HandlerName,
} from '../../domain/identity/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type { EffectRunner } from '../../platform/effect-runner/index.js';
import type { SyncFlow } from '../../worker/sync-flow/index.js';
import {
  queueKey,
  type OutboxEntry,
  type OutboxEntryFailed,
  type PendingEntry,
} from '../entries/index.js';
import type { Handler } from '../handlers/index.js';
import { narrateOutbox } from '../narration/index.js';

export type OfflineActionOutbox = {
  readonly enqueue: (
    entries: ReadonlyArray<PendingEntry>,
  ) => Effect.Effect<void, WriteError>;
  readonly delivered: (
    id: string,
    transaction?: Transaction,
  ) => Effect.Effect<void, OutboxEntryFailed | WriteError>;
  readonly registerHandler: (name: HandlerName, handler: Handler) => void;
  readonly list: () => Effect.Effect<OutboxEntry[], WriteError>;
};

export type OfflineActionTransaction = Transaction & {
  readonly delivered: Promise<void>;
};

export type OfflineActionConfig<P, R> = {
  name: string;
  payload: Schema.Codec<P, any>;
  onMutate: (payload: P) => void;
  mutationFn: (
    payload: P,
    context: { readonly entryId: string },
  ) => Effect.Effect<unknown, unknown, R> | Promise<unknown>;
  queue?: (payload: P) => string;
};

type Variables<P> = { payload: P; replay?: string };

export const makeOfflineActions = <R>(args: {
  outbox: OfflineActionOutbox;
  runner: EffectRunner<R>;
  report: SyncReporter<R>;
  flow: SyncFlow;
}) => {
  const { outbox, runner } = args;
  const replays = new Map<string, Effect.Effect<void, never, R>>();
  let replayed = false;
  const replayRetry = {
    schedule: Schedule.spaced(Duration.seconds(2)),
    times: 5,
  };

  const replayFailed = (entryIds: string[], cause: unknown) =>
    args.report({ _tag: 'OutboxFailed', phase: 'replay', entryIds, cause });

  const create = <P>(action: OfflineActionConfig<P, R>) => {
    if (replays.has(action.name)) {
      throw new Error(
        `[sync] offline action "${action.name}" is already registered`,
      );
    }
    const handlerName = actionHandlerName(action.name);
    const encode = Schema.encodeUnknownEffect(action.payload);
    const decode = Schema.decodeUnknownEffect(action.payload);
    const flow = args.flow.action(action.name).outbox;
    const story = narrateOutbox(flow);

    const register = () =>
      outbox.registerHandler(handlerName, {
        kind: 'action',
        flow,
        send: (payload, entryId) =>
          runner.provide(
            decode(payload).pipe(
              Effect.flatMap((decoded) => {
                const result = action.mutationFn(decoded, { entryId });
                return Effect.isEffect(result)
                  ? result
                  : Effect.promise(() => result);
              }),
            ),
          ),
      });

    const settle = (variables: Variables<P>, transaction: Transaction) =>
      Effect.gen(function* () {
        const id = variables.replay ?? transaction.id;
        const entry =
          variables.replay === undefined
            ? {
                id,
                name: handlerName,
                queue: queueKey(
                  handlerName,
                  action.queue?.(variables.payload) ?? '',
                ),
                enqueuedAt: yield* nextUlid,
                body: {
                  kind: 'action' as const,
                  payload: yield* encode(variables.payload),
                },
              }
            : null;
        yield* story.queue(
          { entryIds: [id], replayed: entry === null },
          entry ? story.enqueue([entry], outbox.enqueue([entry])) : Effect.void,
          outbox.delivered(id, transaction),
        );
      }).pipe(
        flow.collection.withSpan('Offline Action', {
          attributes: {
            action: action.name,
            replayed: variables.replay !== undefined,
          },
        }),
      );

    const optimistic = createOptimisticAction<Variables<P>>({
      onMutate: (variables) => action.onMutate(variables.payload),
      mutationFn: (variables, { transaction }) =>
        runner.runPromise(settle(variables, transaction)),
    });

    // TanStack completes a transaction with no mutations without calling
    // mutationFn, so an action with no local writes settles here instead.
    const run = (variables: Variables<P>): OfflineActionTransaction => {
      const transaction = optimistic(variables);
      const delivered =
        transaction.mutations.length === 0
          ? runner.runPromise(settle(variables, transaction))
          : transaction.isPersisted.promise.then(() => undefined);
      delivered.catch(() => undefined);
      return Object.assign(transaction, { delivered });
    };

    const replay = Effect.gen(function* () {
      const mine = (yield* outbox.list()).filter(
        (entry) =>
          entry.name === handlerName &&
          entry.status !== 'failed' &&
          entry.body.kind === 'action',
      );
      yield* Effect.forEach(
        mine,
        (entry) =>
          decode(entry.body.kind === 'action' ? entry.body.payload : null).pipe(
            Effect.map((payload) => run({ payload, replay: entry.id })),
            Effect.catch((cause) => replayFailed([entry.id], cause)),
          ),
        { discard: true },
      ).pipe(
        flow.outbox.withSpan('Replay pending Entries', {
          attributes: {
            from: flow.collection.name,
            entryCount: mine.length,
            entryIds: mine.map((entry) => entry.id),
          },
        }),
      );
    }).pipe(
      // An unreadable Outbox is retried before the replay is given up on.
      Effect.retry(replayRetry),
    );
    const reported = replay.pipe(
      Effect.catch((cause) => replayFailed([], cause)),
    );

    replays.set(action.name, reported);
    // After the Ready Gate the Drainer is live: replay first, so it cannot
    // deliver and delete an Entry before onMutate has restored it. A replay
    // given up on leaves the Handler unregistered, so its Entries stay pending.
    if (replayed) {
      void runner.runPromise(
        replay.pipe(
          Effect.tap(() => Effect.sync(register)),
          Effect.catch((cause) => replayFailed([], cause)),
        ),
      );
    } else {
      register();
    }
    return (payload: P): OfflineActionTransaction => run({ payload });
  };

  // Runs once at the Ready Gate; actions created afterwards replay themselves.
  const replayAll = Effect.suspend(() => {
    replayed = true;
    return Effect.forEach(replays.values(), (replay) => replay, {
      discard: true,
    });
  });

  return { create, replayAll };
};
