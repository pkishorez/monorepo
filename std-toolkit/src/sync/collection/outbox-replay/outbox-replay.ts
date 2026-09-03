import { Effect } from 'effect';
import type { WriteError } from '../../domain/sync-error/index.js';
import {
  collectionHandlerName,
  type CollectionName,
} from '../../domain/identity/index.js';
import {
  outboxReplay,
  type OutboxEntry,
  type OutboxRuntime,
} from '../../outbox/outbox/index.js';
import type { OutboxFlow } from '../../flow/sync-flow/index.js';

type ReplayCollection = {
  has(key: string): boolean;
  insert(item: unknown, config: { metadata: Record<string, unknown> }): unknown;
  update(
    key: string,
    config: { metadata: Record<string, unknown> },
    updater: (draft: Record<string, unknown>) => void,
  ): unknown;
  delete(key: string, config: { metadata: Record<string, unknown> }): unknown;
};

export const makeOutboxReplay = <TItem>(args: {
  outbox: OutboxRuntime;
  collectionName: CollectionName;
  idField: string | null;
  decode: (value: unknown) => Effect.Effect<TItem, unknown>;
  pick: (after: TItem, changed: ReadonlyArray<string>) => Partial<TItem>;
  report: (entryId: string, cause: unknown) => Effect.Effect<void, never, any>;
  flow: OutboxFlow | null;
}) => {
  const handlerName = collectionHandlerName(args.collectionName);

  const replayEntry = (
    collection: ReplayCollection,
    entry: OutboxEntry,
    keyOverride: string | undefined,
  ): Effect.Effect<void, unknown> =>
    Effect.gen(function* () {
      const body = entry.body;
      if (body.kind !== 'entity') return;
      const key = keyOverride ?? body.key;
      const metadata = outboxReplay(entry.id);
      const exists = collection.has(key);
      switch (body.op) {
        case 'insert': {
          const value = yield* args.decode(body.after);
          if (exists) {
            collection.update(key, { metadata }, (draft) => {
              Object.assign(draft, value);
            });
          } else {
            collection.insert(value, { metadata });
          }
          return;
        }
        case 'update': {
          if (!exists) return;
          const after = yield* args.decode(body.after);
          const updates = args.pick(after, body.changed);
          collection.update(key, { metadata }, (draft) => {
            Object.assign(draft, updates);
          });
          return;
        }
        case 'delete':
          if (exists) collection.delete(key, { metadata });
          return;
      }
    });

  // A per-Entry failure is reported and skipped; an unreadable Outbox fails the
  // replay, so the Collection never reports ready without its optimistic writes.
  return (
    collection: unknown,
    keyOverride?: string,
  ): Effect.Effect<void, WriteError> =>
    Effect.gen(function* () {
      const entries = yield* args.outbox.entries.list();
      const mine = entries.filter(
        (entry) => entry.name === handlerName && entry.status !== 'failed',
      );
      yield* Effect.forEach(
        mine,
        (entry) =>
          replayEntry(collection as ReplayCollection, entry, keyOverride).pipe(
            Effect.catch((cause) => args.report(entry.id, cause)),
          ),
        { discard: true },
      ).pipe(
        args.flow
          ? args.flow.outbox.withSpan('Replay pending Entries', {
              attributes: {
                from: args.flow.collection.name,
                entryCount: mine.length,
                entryIds: mine.map((entry) => entry.id),
              },
            })
          : (effect) => effect,
      );
    }).pipe(Effect.asVoid) as Effect.Effect<void, WriteError>;
};
