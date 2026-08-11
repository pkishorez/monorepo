import type {
  DeleteMutationFnParams,
  InsertMutationFnParams,
  UpdateMutationFnParams,
  Transaction,
} from '@tanstack/react-db';
import { Effect } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type { AnyEntityESchema } from '../../../eschema/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type {
  CollectionItem,
  UpdatePayload,
} from '../../runtime/collection-model/index.js';
import {
  buildPacedUpdate,
  coalesceStrategy,
  type PaceStrategyFactory,
} from '../../runtime/mutation-pacing/index.js';
import { stripMetaPartial } from '../../runtime/collection-model/index.js';
import type { EffectRunner } from '../../runtime/effect-runner/index.js';
import type { PendingTracker } from '../../runtime/pending-mutations/index.js';

const stripMeta = <TItem extends object>(
  item: CollectionItem<TItem>,
): TItem => {
  const { _meta: _ignored, ...value } = item;
  return value as TItem;
};

/**
 * Builds the TanStack mutation handlers for a partitioned collection. Each handler
 * extracts the payload from the transaction, runs the user Effect, and flushes the
 * returned server entity through `writeServerTruth`; `onDelete` flushes the
 * tombstone the user Effect returns. `pacedUpdate` paces optimistic updates per key via
 * `buildPacedUpdate` (default `coalesce`), applying the optimistic row through the
 * engine-supplied `optimistic` callback and flushing the confirmed entity through
 * `writeServerTruth`. Mutation results never touch sync-state.
 */
export const buildMutationHandlers = <
  S extends AnyEntityESchema,
  R = never,
>(args: {
  schema: S;
  writeServerTruth: (
    entities: EntityType<S['Type']>[],
  ) => Effect.Effect<void, WriteError>;
  onInsert?: (
    item: S['Type'],
  ) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
  onUpdate?: (
    payload: UpdatePayload<S['Type'], S>,
  ) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
  onDelete?: (id: string) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
  updatePacing?: PaceStrategyFactory;
  pending: PendingTracker;
  runner: EffectRunner<R>;
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
    runner,
  } = args;

  const idField = schema.idField as string;

  const flush = (entity: EntityType<TItem>): Promise<void> =>
    runner.runPromise(writeServerTruth([entity]));

  const runMutation = async (
    key: string,
    effect: Effect.Effect<EntityType<TItem>, unknown, R>,
  ): Promise<void> => {
    pending.increment(key);
    try {
      const result = await runner.runPromise(effect);
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
          (changes: Partial<TItem>) => Transaction<Partial<TItem>>
        >();
        return (
          key: string,
          changes: Partial<TItem>,
          optimistic: (key: string, changes: Partial<TItem>) => void,
        ): Transaction<Partial<TItem>> => {
          let paced = mutate.get(key);
          if (!paced) {
            paced = buildPacedUpdate<Partial<TItem>>({
              strategy: (updatePacing ?? coalesceStrategy)(),
              optimistic: (next) => optimistic(key, next),
              commit: async (merged) => {
                const updates = stripMetaPartial<TItem>(merged);
                await runMutation(
                  key,
                  onUpdate(buildUpdatePayload(key, updates)),
                );
              },
            });
            mutate.set(key, paced);
          }
          return paced(changes);
        };
      }
    : () => (): Transaction<Partial<TItem>> => {
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
