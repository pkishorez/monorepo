import type {
  DeleteMutationFnParams,
  InsertMutationFnParams,
  UpdateMutationFnParams,
  Transaction,
} from '@tanstack/react-db';
import { Effect } from 'effect';
import type { DecodedEntity } from '../../../core/index.js';
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
 * extracts every payload in the transaction, runs the user Effect for each one with
 * bounded concurrency, and flushes the returned backend-confirmed Entities through a
 * single `applyToSyncReplica`; `onDelete` flushes the tombstones the user Effect
 * returns. `pacedUpdate` paces optimistic updates per key via
 * `buildPacedUpdate` (default `coalesce`), applying the optimistic row through the
 * engine-supplied `optimistic` callback and flushing the confirmed entity through
 * `applyToSyncReplica`. Mutation results never touch sync-state.
 */
export const buildMutationHandlers = <
  S extends AnyEntityESchema,
  R = never,
>(args: {
  schema: S;
  collectionName: string;
  applyToSyncReplica: (
    entities: DecodedEntity<S['Type']>[],
  ) => Effect.Effect<void, WriteError>;
  onInsert?: (
    item: S['Type'],
  ) => Effect.Effect<DecodedEntity<S['Type']>, unknown, R>;
  onUpdate?: (
    payload: UpdatePayload<S['Type'], S>,
  ) => Effect.Effect<DecodedEntity<S['Type']>, unknown, R>;
  onDelete?: (
    payload: DeletePayload<S['Type']>,
  ) => Effect.Effect<DecodedEntity<S['Type']>, unknown, R>;
  updatePacing?: PaceStrategyFactory;
  pending: PendingTracker;
  runner: EffectRunner<R>;
  flow: () => CollectionFlow | null;
}) => {
  type TItem = S['Type'];
  type TCollItem = CollectionItem<TItem>;

  const MUTATION_CONCURRENCY = 5;

  const {
    applyToSyncReplica,
    onInsert,
    onUpdate,
    onDelete,
    updatePacing,
    pending,
    runner,
    flow,
  } = args;

  const runMutations = async (
    operation: 'delete' | 'insert' | 'update',
    items: readonly {
      key: string;
      effect: Effect.Effect<DecodedEntity<TItem>, unknown, R>;
    }[],
  ): Promise<void> => {
    for (const item of items) pending.increment(item.key);
    try {
      const mutation = Effect.gen(function* () {
        const results = yield* Effect.all(
          items.map((item) => item.effect),
          { concurrency: MUTATION_CONCURRENCY },
        );
        yield* applyToSyncReplica(results);
      });
      const activeFlow = flow();
      await runner.runPromise(
        activeFlow
          ? mutation.pipe(
              activeFlow.collection.withSpan('Collection Mutation', {
                attributes: {
                  collection: args.collectionName,
                  ...(items.length === 1 ? { entityKey: items[0]!.key } : {}),
                  mutationCount: items.length,
                  operation,
                },
              }),
            )
          : mutation,
      );
    } finally {
      for (const item of items) pending.decrement(item.key);
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
        await runMutations(
          'insert',
          transaction.mutations.map((mutation) => ({
            key: String(mutation.key),
            effect: onInsert(stripMeta<TItem>(mutation.modified)),
          })),
        );
      }
    : undefined;

  const updateHandler = onUpdate
    ? async ({
        transaction,
      }: UpdateMutationFnParams<TCollItem, string>): Promise<void> => {
        await runMutations(
          'update',
          transaction.mutations.map((mutation) => ({
            key: String(mutation.key),
            effect: onUpdate(
              buildUpdatePayload(
                mutation.original,
                stripMetaPartial<TItem>(mutation.changes),
              ),
            ),
          })),
        );
      }
    : undefined;

  const deleteHandler = onDelete
    ? async ({
        transaction,
      }: DeleteMutationFnParams<TCollItem, string>): Promise<void> => {
        await runMutations(
          'delete',
          transaction.mutations.map((mutation) => ({
            key: String(mutation.key),
            effect: onDelete({ current: stripMeta(mutation.original) }),
          })),
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
                await runMutations('update', [
                  {
                    key,
                    effect: onUpdate(
                      buildUpdatePayload(rows.get(key)!, updates),
                    ),
                  },
                ]);
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
