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
import { MUTATION_CONCURRENCY } from '../../domain/tuning/index.js';
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
    items: ReadonlyArray<S['Type']>,
  ) => Effect.Effect<ReadonlyArray<DecodedEntity<S['Type']>>, unknown, R>;
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
    keys: readonly string[],
    confirm: Effect.Effect<ReadonlyArray<DecodedEntity<TItem>>, unknown, R>,
  ): Promise<void> => {
    for (const key of keys) pending.increment(key);
    try {
      const mutation = Effect.gen(function* () {
        const results = yield* confirm;
        yield* applyToSyncReplica([...results]);
      });
      const activeFlow = flow();
      await runner.runPromise(
        activeFlow
          ? mutation.pipe(
              activeFlow.collection.withSpan('Collection Mutation', {
                attributes: {
                  collection: args.collectionName,
                  ...(keys.length === 1 ? { entityKey: keys[0] } : {}),
                  mutationCount: keys.length,
                  operation,
                },
              }),
            )
          : mutation,
      );
    } finally {
      for (const key of keys) pending.decrement(key);
    }
  };

  const eachConfirmed = (
    effects: ReadonlyArray<Effect.Effect<DecodedEntity<TItem>, unknown, R>>,
  ) => Effect.all(effects, { concurrency: MUTATION_CONCURRENCY });

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
          transaction.mutations.map((mutation) => String(mutation.key)),
          onInsert(
            transaction.mutations.map((mutation) =>
              stripMeta<TItem>(mutation.modified),
            ),
          ),
        );
      }
    : undefined;

  const updateHandler = onUpdate
    ? async ({
        transaction,
      }: UpdateMutationFnParams<TCollItem, string>): Promise<void> => {
        await runMutations(
          'update',
          transaction.mutations.map((mutation) => String(mutation.key)),
          eachConfirmed(
            transaction.mutations.map((mutation) =>
              onUpdate(
                buildUpdatePayload(
                  mutation.original,
                  stripMetaPartial<TItem>(mutation.changes),
                ),
              ),
            ),
          ),
        );
      }
    : undefined;

  const deleteHandler = onDelete
    ? async ({
        transaction,
      }: DeleteMutationFnParams<TCollItem, string>): Promise<void> => {
        await runMutations(
          'delete',
          transaction.mutations.map((mutation) => String(mutation.key)),
          eachConfirmed(
            transaction.mutations.map((mutation) =>
              onDelete({ current: stripMeta(mutation.original) }),
            ),
          ),
        );
      }
    : undefined;

  const makePacedUpdate = onUpdate
    ? () => {
        const mutate = new Map<
          string,
          (changes: Partial<TItem>) => Transaction<Partial<TItem>>
        >();
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
                await runMutations(
                  'update',
                  [key],
                  eachConfirmed([
                    onUpdate(buildUpdatePayload(rows.get(key)!, updates)),
                  ]),
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
