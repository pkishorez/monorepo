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
  DeletePayload,
  UpdatePayload,
} from '../../runtime/collection-model/index.js';
import {
  buildPacedUpdate,
  coalesceStrategy,
  type PaceStrategyFactory,
} from '../../runtime/mutation-pacing/index.js';
import {
  stripMeta,
  stripMetaPartial,
} from '../../runtime/collection-model/index.js';
import type { EffectRunner } from '../../runtime/effect-runner/index.js';
import type { PendingTracker } from '../../runtime/pending-mutations/index.js';
import type { CollectionFlow } from '../../runtime/sync-flow/index.js';

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
  onDelete?: (
    payload: DeletePayload<S['Type']>,
  ) => Effect.Effect<EntityType<S['Type']>, unknown, R>;
  updatePacing?: PaceStrategyFactory;
  pending: PendingTracker;
  runner: EffectRunner<R>;
  flow: () => CollectionFlow | null;
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
    flow,
  } = args;

  const runMutation = async (
    key: string,
    operation: 'delete' | 'insert' | 'update',
    effect: Effect.Effect<EntityType<TItem>, unknown, R>,
  ): Promise<void> => {
    pending.increment(key);
    try {
      const mutation = Effect.gen(function* () {
        const result = yield* effect;
        yield* writeServerTruth([result]);
      });
      const activeFlow = flow();
      await runner.runPromise(
        activeFlow
          ? mutation.pipe(
              activeFlow.collection.withSpan('Collection Mutation', {
                attributes: {
                  collection: schema.name,
                  entityKey: key,
                  operation,
                },
              }),
            )
          : mutation,
      );
    } finally {
      pending.decrement(key);
    }
  };

  const buildUpdatePayload = (
    current: CollectionItem<TItem>,
    updates: Partial<TItem>,
  ): UpdatePayload<TItem, S> =>
    ({ current: stripMeta(current), updates }) as UpdatePayload<TItem, S>;

  const insertHandler = onInsert
    ? async ({
        transaction,
      }: InsertMutationFnParams<TCollItem, string>): Promise<void> => {
        const mutation = transaction.mutations[0]!;
        const value = stripMeta<TItem>(mutation.modified);
        await runMutation(String(mutation.key), 'insert', onInsert(value));
      }
    : undefined;

  const updateHandler = onUpdate
    ? async ({
        transaction,
      }: UpdateMutationFnParams<TCollItem, string>): Promise<void> => {
        const mutation = transaction.mutations[0]!;
        const key = String(mutation.key);
        const updates = stripMetaPartial<TItem>(mutation.changes);
        await runMutation(
          key,
          'update',
          onUpdate(buildUpdatePayload(mutation.original, updates)),
        );
      }
    : undefined;

  const deleteHandler = onDelete
    ? async ({
        transaction,
      }: DeleteMutationFnParams<TCollItem, string>): Promise<void> => {
        const mutation = transaction.mutations[0]!;
        const key = String(mutation.key);
        await runMutation(
          key,
          'delete',
          onDelete({ current: stripMeta(mutation.original) }),
        );
      }
    : undefined;

  const makePacedUpdate = onUpdate
    ? () => {
        const mutate = new Map<
          string,
          (changes: Partial<TItem>) => Transaction<Partial<TItem>>
        >();
        // The pacer is cached per key, so `commit` reads the row from here rather
        // than closing over the row seen on the first call for that key.
        const rows = new Map<string, CollectionItem<TItem>>();
        return (
          key: string,
          current: CollectionItem<TItem>,
          changes: Partial<TItem>,
          optimistic: (key: string, changes: Partial<TItem>) => void,
        ): Transaction<Partial<TItem>> => {
          rows.set(key, current);
          let paced = mutate.get(key);
          if (!paced) {
            paced = buildPacedUpdate<Partial<TItem>>({
              strategy: (updatePacing ?? coalesceStrategy)(),
              optimistic: (next) => optimistic(key, next),
              commit: async (merged) => {
                const updates = stripMetaPartial<TItem>(merged);
                await runMutation(
                  key,
                  'update',
                  onUpdate(buildUpdatePayload(rows.get(key)!, updates)),
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
