import type {
  DeleteMutationFnParams,
  InsertMutationFnParams,
  UpdateMutationFnParams,
} from '@tanstack/react-db';
import { Effect } from 'effect';
import type { Entity } from '../../core/index.js';
import type { AnyEntityESchema } from '../../eschema/index.js';
import {
  changedFields,
  stripMeta,
  type CollectionItem,
  type DeletePayload,
  type UpdatePayload,
} from '../domain/collection-item/index.js';
import type { WriteError } from '../domain/sync-error/index.js';
import type { EffectRunner } from '../platform/effect-runner/index.js';

// Per-item onUpdate / onDelete callbacks of one transaction run this many at a time.
const MUTATION_CONCURRENCY = 5;

export type MutationCallbacks<S extends AnyEntityESchema, R> = {
  onInsert?: (
    items: ReadonlyArray<S['Type']>,
  ) => Effect.Effect<ReadonlyArray<Entity<S['Type']>>, unknown, R>;
  onUpdate?: (
    payload: UpdatePayload<S['Type'], S>,
  ) => Effect.Effect<Entity<S['Type']>, unknown, R>;
  onDelete?: (
    payload: DeletePayload<S['Type']>,
  ) => Effect.Effect<Entity<S['Type']>, unknown, R>;
};

/**
 * TanStack DB mutation handlers over the application's Mutation Callbacks.
 * Each callback returns what the Backend stored, and that goes straight into
 * the Sync Replica; a failure rejects the transaction so TanStack DB rolls
 * the optimistic change back.
 */
export const makeMutations = <S extends AnyEntityESchema, R>(
  args: MutationCallbacks<S, R> & {
    schema: S;
    confirm: (
      entities: ReadonlyArray<Entity<S['Type']>>,
    ) => Effect.Effect<void, WriteError>;
    runner: EffectRunner<R>;
  },
) => {
  type TItem = S['Type'];
  type Item = CollectionItem<TItem>;
  const { schema, onInsert, onUpdate, onDelete, confirm, runner } = args;
  const valueOf = (item: Item): TItem => stripMeta<TItem>(item);

  // TanStack DB keeps a direct insert/update/delete optimistic until a synced
  // write for its key arrives after it recorded the mutation, and it records
  // the mutation only after calling this handler. A callback that answers
  // synchronously would get its synced write in first and leave the row
  // `$synced: false` forever, so the write waits until the handler has yielded.
  const run = (
    confirmed: Effect.Effect<ReadonlyArray<Entity<TItem>>, unknown, R>,
  ): Promise<void> =>
    runner.runPromise(
      Effect.flatMap(confirmed, (entities) =>
        Effect.yieldNow.pipe(Effect.andThen(confirm(entities))),
      ),
    );

  const each = (
    effects: ReadonlyArray<Effect.Effect<Entity<TItem>, unknown, R>>,
  ) => Effect.all(effects, { concurrency: MUTATION_CONCURRENCY });

  const updatePayload = (original: Item, modified: Item) => {
    const current = valueOf(original);
    const after = valueOf(modified);
    const updates = Object.fromEntries(
      changedFields(current, after)
        .filter((field) => field !== schema.idField)
        .map((field) => [field, (after as Record<string, unknown>)[field]]),
    );
    return { current, updates } as UpdatePayload<TItem, S>;
  };

  return {
    onInsert: onInsert
      ? ({ transaction }: InsertMutationFnParams<Item, string>) =>
          run(onInsert(transaction.mutations.map((m) => valueOf(m.modified))))
      : undefined,
    onUpdate: onUpdate
      ? ({ transaction }: UpdateMutationFnParams<Item, string>) =>
          run(
            each(
              transaction.mutations.map((m) =>
                onUpdate(updatePayload(m.original, m.modified)),
              ),
            ),
          )
      : undefined,
    onDelete: onDelete
      ? ({ transaction }: DeleteMutationFnParams<Item, string>) =>
          run(
            each(
              transaction.mutations.map((m) =>
                onDelete({ current: valueOf(m.original) }),
              ),
            ),
          )
      : undefined,
  };
};
