import type { Transaction, UpdateMutationFnParams } from '@tanstack/react-db';
import { Effect } from 'effect';
import type { EntityType, SingleEntityType } from '../../core/index.js';
import type { WriteError } from '../source-of-truth/write-error.js';
import type { CollectionItem } from '../types.js';
import { buildPacedUpdate } from '../paced/build-paced-update.js';
import { coalesceStrategy } from '../paced/coalesce-strategy.js';
import type { PaceStrategyFactory } from '../paced/pace-strategy.js';
import { makePendingTracker } from '../partitioned/mutations.js';
import { toEntity } from '../util/to-entity.js';
import { stripMetaPartial } from '../util/strip-meta.js';

/** The single-item collection has one record, so one fixed pending-tracker key. */
const SINGLE_KEY = '__single__';

/**
 * Builds the single-item mutation handlers. There is no insert or delete: a
 * single-item record has collection-level lifecycle only. `onUpdate` runs the user
 * Effect and flushes the returned server entity through `writeServerTruth`.
 * `pacedUpdate` paces optimistic updates through a single in-flight gate (default
 * `coalesce`), applying the optimistic row via the supplied `optimistic` callback
 * and flushing the confirmed entity. Mutation results never touch sync-state.
 */
export const buildMutationHandlers = <TItem extends object>(args: {
  writeServerTruth: (
    entities: EntityType<TItem>[],
  ) => Effect.Effect<void, WriteError>;
  onUpdate?:
    | ((payload: {
        updates: Partial<TItem>;
      }) => Effect.Effect<SingleEntityType<TItem>>)
    | undefined;
  updatePacing?: PaceStrategyFactory | undefined;
}) => {
  type TCollItem = CollectionItem<TItem>;
  const { writeServerTruth, onUpdate, updatePacing } = args;

  const pending = makePendingTracker();

  const flush = (entity: SingleEntityType<TItem>): Promise<void> =>
    Effect.runPromise(writeServerTruth([toEntity(entity)]));

  const runUpdate = async (updates: Partial<TItem>): Promise<void> => {
    pending.increment(SINGLE_KEY);
    try {
      const result = await Effect.runPromise(onUpdate!({ updates }));
      await flush(result);
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
        let paced: ((changes: Partial<TItem>) => Transaction) | null = null;
        return (
          changes: Partial<TItem>,
          optimistic: (changes: Partial<TItem>) => void,
        ): Transaction => {
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
    : () => (): Transaction => {
        throw new Error('pacedUpdate requires onUpdate to be defined');
      };

  return {
    onUpdate: updateHandler,
    pacedUpdate: makePacedUpdate(),
    pendingCount: () => pending.count(SINGLE_KEY),
    subscribePending: (listener: () => void) => pending.subscribe(listener),
  };
};
