import type {
  DeleteMutationFnParams,
  InsertMutationFnParams,
  UpdateMutationFnParams,
  Transaction,
} from '@tanstack/react-db';
import { Effect } from 'effect';
import type { EntityType } from '@std-toolkit/core';
import type { AnyEntityESchema } from '@std-toolkit/eschema';
import type { WriteError } from '../source-of-truth/write-error.js';
import type { CollectionItem, UpdatePayload } from '../types.js';
import { buildPacedUpdate } from '../paced/build-paced-update.js';
import { coalesceStrategy } from '../paced/coalesce-strategy.js';
import type { PaceStrategyFactory } from '../paced/pace-strategy.js';
import { stripMetaPartial } from '../util/strip-meta.js';

/**
 * Tracks the count of in-flight mutations per key and notifies subscribers on every
 * change. Mutation pending state is independent of sync-state. A key drops out of the
 * map once its count returns to zero, so `count` reports 0 for any untouched key.
 */
export type PendingTracker = {
  increment: (key: string) => void;
  decrement: (key: string) => void;
  count: (key: string) => number;
  subscribe: (listener: () => void) => () => void;
};

/**
 * Builds a fresh per-key pending-mutation counter with subscription support.
 */
export const makePendingTracker = (): PendingTracker => {
  const counts = new Map<string, number>();
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    increment: (key) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      notify();
    },
    decrement: (key) => {
      const next = (counts.get(key) ?? 0) - 1;
      if (next <= 0) counts.delete(key);
      else counts.set(key, next);
      notify();
    },
    count: (key) => counts.get(key) ?? 0,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const stripMeta = <TItem extends object>(
  item: CollectionItem<TItem>,
): TItem => {
  const { _meta: _ignored, ...value } = item;
  return value as TItem;
};

/**
 * Builds the TanStack mutation handlers for a partitioned collection. Each handler
 * extracts the payload from the transaction, runs the user Effect, and flushes the
 * returned server envelope through `writeServerTruth`; `onDelete` flushes the
 * tombstone the user Effect returns. `pacedUpdate` paces optimistic updates per key via
 * `buildPacedUpdate` (default `coalesce`), applying the optimistic row through the
 * engine-supplied `optimistic` callback and flushing the confirmed envelope through
 * `writeServerTruth`. Mutation results never touch sync-state.
 */
export const buildMutationHandlers = <S extends AnyEntityESchema>(args: {
  schema: S;
  writeServerTruth: (
    entities: EntityType<S['Type']>[],
  ) => Effect.Effect<void, WriteError>;
  onInsert?: (item: S['Type']) => Effect.Effect<EntityType<S['Type']>>;
  onUpdate?: (
    payload: UpdatePayload<S['Type'], S>,
  ) => Effect.Effect<EntityType<S['Type']>>;
  onDelete?: (id: string) => Effect.Effect<EntityType<S['Type']>>;
  updatePacing?: PaceStrategyFactory;
  pending: PendingTracker;
}) => {
  type TItem = S['Type'];
  type TCollItem = CollectionItem<TItem>;

  const {
    schema,
    writeServerTruth,
    onInsert,
    onUpdate,
    onDelete,
    updatePacing,
    pending,
  } = args;

  const idField = schema.idField as string;

  const flush = (entity: EntityType<TItem>): Promise<void> =>
    Effect.runPromise(writeServerTruth([entity]));

  const runMutation = async (
    key: string,
    effect: Effect.Effect<EntityType<TItem>>,
  ): Promise<void> => {
    pending.increment(key);
    try {
      const result = await Effect.runPromise(effect);
      await flush(result);
    } finally {
      pending.decrement(key);
    }
  };

  const buildUpdatePayload = (
    key: string,
    updates: Partial<TItem>,
  ): UpdatePayload<TItem, S> =>
    ({ [idField]: key, updates }) as unknown as UpdatePayload<TItem, S>;

  const insertHandler = onInsert
    ? async ({
        transaction,
      }: InsertMutationFnParams<TCollItem, string>): Promise<void> => {
        const mutation = transaction.mutations[0]!;
        const value = stripMeta<TItem>(mutation.modified);
        await runMutation(String(mutation.key), onInsert(value));
      }
    : undefined;

  const updateHandler = onUpdate
    ? async ({
        transaction,
      }: UpdateMutationFnParams<TCollItem, string>): Promise<void> => {
        const mutation = transaction.mutations[0]!;
        const key = String(mutation.key);
        const updates = stripMetaPartial<TItem>(mutation.changes);
        await runMutation(key, onUpdate(buildUpdatePayload(key, updates)));
      }
    : undefined;

  const deleteHandler = onDelete
    ? async ({
        transaction,
      }: DeleteMutationFnParams<TCollItem, string>): Promise<void> => {
        const key = String(transaction.mutations[0]!.key);
        await runMutation(key, onDelete(key));
      }
    : undefined;

  const makePacedUpdate = onUpdate
    ? () => {
        const mutate = new Map<
          string,
          (changes: Partial<TItem>) => Transaction
        >();
        return (
          key: string,
          changes: Partial<TItem>,
          optimistic: (key: string, changes: Partial<TItem>) => void,
        ): Transaction => {
          let paced = mutate.get(key);
          if (!paced) {
            paced = buildPacedUpdate<Partial<TItem>>({
              strategy: (updatePacing ?? coalesceStrategy)(),
              optimistic: (next) => optimistic(key, next),
              commit: async (merged) => {
                const updates = stripMetaPartial<TItem>(merged);
                pending.increment(key);
                try {
                  const result = await Effect.runPromise(
                    onUpdate(buildUpdatePayload(key, updates)),
                  );
                  await flush(result);
                } finally {
                  pending.decrement(key);
                }
              },
            });
            mutate.set(key, paced);
          }
          return paced(changes);
        };
      }
    : () => (): Transaction => {
        throw new Error('pacedUpdate requires onUpdate to be defined');
      };

  const pacedUpdate = makePacedUpdate();

  return {
    onInsert: insertHandler,
    onUpdate: updateHandler,
    onDelete: deleteHandler,
    pacedUpdate,
    pendingCount: (key: string) => pending.count(key),
    subscribePending: (listener: () => void) => pending.subscribe(listener),
  };
};
