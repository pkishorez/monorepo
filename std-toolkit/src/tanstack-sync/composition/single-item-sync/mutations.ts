import type { Transaction, UpdateMutationFnParams } from '@tanstack/react-db';
import { Effect } from 'effect';
import type { EntityType, SingleEntityType } from '../../../core/index.js';
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
export const buildMutationHandlers = <TItem extends object, R = never>(args: {
  writeServerTruth: (
    entities: EntityType<TItem>[],
  ) => Effect.Effect<void, WriteError>;
  onUpdate?:
    | ((payload: {
        updates: Partial<TItem>;
      }) => Effect.Effect<SingleEntityType<TItem>, unknown, R>)
    | undefined;
  updatePacing?: PaceStrategyFactory | undefined;
  runner: EffectRunner<R>;
}) => {
  type TCollItem = CollectionItem<TItem>;
  const { writeServerTruth, onUpdate, updatePacing, runner } = args;

  const pending = runner.runSync(makePendingTracker);

  const flush = (entity: SingleEntityType<TItem>): Promise<void> =>
    runner.runPromise(writeServerTruth([toEntity(entity)]));

  const runUpdate = async (updates: Partial<TItem>): Promise<void> => {
    pending.increment(SINGLE_KEY);
    try {
      const result = await runner.runPromise(onUpdate!({ updates }));
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
