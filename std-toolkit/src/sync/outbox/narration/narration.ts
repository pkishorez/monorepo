import { Cause, Effect, Exit } from 'effect';
import type { OutboxFlow } from '../../worker/sync-flow/index.js';
import {
  isOutboxUnreachable,
  type OutboxEntry,
  type PendingEntry,
  type Request,
} from '../entries/index.js';

const batchAttributes = (batch: ReadonlyArray<PendingEntry>) => ({
  entryIds: batch.map((entry) => entry.id),
  entryCount: batch.length,
  queues: [...new Set(batch.map((entry) => entry.queue))],
  handler: batch[0]?.name,
  operations: [
    ...new Set(
      batch.map((entry) =>
        entry.body.kind === 'entity' ? entry.body.op : 'action',
      ),
    ),
  ],
});

const failureText = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const count = (n: number, noun: string) =>
  `${n} ${n === 1 ? noun : `${noun.replace(/y$/, 'ie')}s`}`;

// A collection or action asks the one Outbox to hold its writes; the Outbox
// answers once the Drainer (this tab's or a peer's) has sent them.
export const narrateOutbox = (flow: OutboxFlow | null) => ({
  enqueue: <A, E, R>(
    batch: ReadonlyArray<PendingEntry>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    flow
      ? effect.pipe(
          flow.outbox.withSpan('Enqueue', {
            attributes: {
              ...batchAttributes(batch),
              from: flow.collection.name,
            },
          }),
        )
      : effect,
  // Message first, then the Enqueue spans, then the wait, so the panel reads
  // in the order things happen.
  queue: <A, E, R, E2, R2>(
    args: { entryIds: ReadonlyArray<string>; replayed: boolean },
    enqueue: Effect.Effect<unknown, E2, R2>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | E2, R | R2> =>
    flow
      ? Effect.gen(function* () {
          const token = yield* flow.collection.send(
            flow.outbox.name,
            args.replayed
              ? `Await ${count(args.entryIds.length, 'replayed entry')}`
              : `Queue ${count(args.entryIds.length, 'entry')}`,
            {
              attributes: {
                entryIds: args.entryIds,
                entryCount: args.entryIds.length,
              },
            },
          );
          return yield* enqueue.pipe(
            Effect.andThen(effect),
            Effect.tap(() => flow.outbox.reply(token, 'Delivered')),
            Effect.tapError((error) =>
              flow.outbox.reply(token, `Failed: ${failureText(error)}`, {
                level: 'error',
              }),
            ),
          );
        })
      : Effect.andThen(enqueue, effect),
});

export type RequestOutcome =
  | 'delivered'
  | 'failed'
  | 'unreachable'
  | 'interrupted';

export const requestOutcome = (
  exit: Exit.Exit<void, unknown>,
): RequestOutcome =>
  Exit.isSuccess(exit)
    ? 'delivered'
    : Cause.hasInterruptsOnly(exit.cause)
      ? 'interrupted'
      : isOutboxUnreachable(Cause.squash(exit.cause))
        ? 'unreachable'
        : 'failed';

// The Outbox hands a Queue to the Drainer; the Drainer sends it and reports back.
export const narrateRequest = <R>(
  flow: OutboxFlow | null,
  args: {
    queue: string;
    group: ReadonlyArray<OutboxEntry>;
    request: Request | null;
  },
  send: Effect.Effect<void, unknown, R>,
): Effect.Effect<Exit.Exit<void, unknown>, never, R> => {
  if (!flow) return Effect.exit(send);
  const attributes = {
    queue: args.queue,
    entryIds: args.group.map((entry) => entry.id),
    entryCount: args.group.length,
    handler: args.group[0]!.name,
    operation: args.request ? args.request.op : 'action',
  };
  return Effect.gen(function* () {
    const token = yield* flow.outbox.send(flow.drainer.name, 'Send Queue', {
      attributes,
    });
    const exit = yield* Effect.exit(
      send.pipe(flow.drainer.withSpan('Request', { attributes })),
    );
    const outcome = requestOutcome(exit);
    const message = Exit.isSuccess(exit)
      ? 'Delivered'
      : outcome === 'unreachable'
        ? 'Backend unreachable, kept pending'
        : outcome === 'interrupted'
          ? 'Interrupted, kept pending'
          : `Failed: ${failureText(Cause.squash(exit.cause))}`;
    yield* flow.drainer.reply(token, message, {
      attributes: { ...attributes, outcome },
      level: outcome === 'failed' ? 'error' : 'info',
    });
    return exit;
  });
};
