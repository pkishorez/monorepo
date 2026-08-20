import type { Transaction, UpdateMutationFnParams } from '@tanstack/react-db';
import { Effect } from 'effect';
import type {
  DecodedEntity,
  DecodedSingleEntity,
} from '../../../core/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type { CollectionItem } from '../../runtime/collection-model/index.js';
import {
  buildPacedUpdate,
  coalesceStrategy,
  type PaceStrategyFactory,
} from '../../runtime/mutation-pacing/index.js';
import { makePendingTracker } from '../../runtime/pending-mutations/index.js';
import {
  stripMetaPartial,
  toEntity,
} from '../../runtime/collection-model/index.js';
import type { EffectRunner } from '../../runtime/effect-runner/index.js';
import type { CollectionFlow } from '../../runtime/sync-flow/index.js';

/** The single-item collection has one record, so one fixed pending-tracker key. */
const SINGLE_KEY = '__single__';

/**
 * Builds the single-item mutation handlers. There is no insert or delete: a
 * single-item record has collection-level lifecycle only. `onUpdate` runs the user
 * Effect and flushes the returned backend-confirmed Entity through
 * `applyToSyncReplica`.
 * `pacedUpdate` paces optimistic updates through a single in-flight gate (default
 * `coalesce`), applying the optimistic row via the supplied `optimistic` callback
 * and flushing the confirmed entity. Mutation results never touch sync-state.
 */
export const buildMutationHandlers = <TItem extends object, R = never>(args: {
  collectionName: string;
  applyToSyncReplica: (
    entities: DecodedEntity<TItem>[],
  ) => Effect.Effect<void, WriteError>;
  onUpdate?:
    | ((payload: {
        updates: Partial<TItem>;
      }) => Effect.Effect<DecodedSingleEntity<TItem>, unknown, R>)
    | undefined;
  updatePacing?: PaceStrategyFactory | undefined;
  runner: EffectRunner<R>;
  flow: () => CollectionFlow | null;
}) => {
  type TCollItem = CollectionItem<TItem>;
  const { applyToSyncReplica, onUpdate, updatePacing, runner, flow } = args;

  const pending = runner.runSync(makePendingTracker);

  const runUpdate = async (updates: Partial<TItem>): Promise<void> => {
    pending.increment(SINGLE_KEY);
    try {
      const mutation = Effect.gen(function* () {
        const result = yield* onUpdate!({ updates });
        yield* applyToSyncReplica([toEntity(result)]);
      });
      const activeFlow = flow();
      await runner.runPromise(
        activeFlow
          ? mutation.pipe(
              activeFlow.collection.withSpan('Collection Mutation', {
                attributes: {
                  collection: args.collectionName,
                  operation: 'update',
                },
              }),
            )
          : mutation,
      );
    } finally {
      pending.decrement(SINGLE_KEY);
    }
  };

  const updateHandler = onUpdate
    ? async ({
        transaction,
      }: UpdateMutationFnParams<TCollItem, string>): Promise<void> => {
        const mutation = transaction.mutations[0]!;
        await runUpdate(stripMetaPartial<TItem>(mutation.changes));
      }
    : undefined;

  const makePacedUpdate = onUpdate
    ? () => {
        let paced:
          | ((changes: Partial<TItem>) => Transaction<Partial<TItem>>)
          | null = null;
        return (
          changes: Partial<TItem>,
          optimistic: (changes: Partial<TItem>) => void,
        ): Transaction<Partial<TItem>> => {
          if (!paced) {
            paced = buildPacedUpdate<Partial<TItem>>({
              strategy: (updatePacing ?? coalesceStrategy)(),
              optimistic,
              commit: (merged) => runUpdate(stripMetaPartial<TItem>(merged)),
            });
          }
          return paced(changes);
        };
      }
    : () => (): Transaction<Partial<TItem>> => {
        throw new Error('pacedUpdate requires onUpdate to be defined');
      };

  return {
    onUpdate: updateHandler,
    pacedUpdate: makePacedUpdate(),
    pendingCount: () => pending.count(SINGLE_KEY),
    subscribePending: (listener: () => void) => pending.subscribe(listener),
  };
};
