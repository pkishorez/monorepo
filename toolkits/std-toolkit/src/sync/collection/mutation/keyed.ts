import type {
  DeleteMutationFnParams,
  InsertMutationFnParams,
  PendingMutation,
  Transaction,
  UpdateMutationFnParams,
} from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import { nextUlid, type Entity } from '../../../core/index.js';
import { toSchema, type AnyEntityESchema } from '../../../eschema/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import {
  collectionHandlerName,
  type CollectionName,
} from '../../domain/identity/index.js';
import {
  narrateOutbox,
  queueKey,
  type EntityBody,
  type OutboxRuntime,
  type Request,
} from '../../outbox/outbox/index.js';
import { runOutboxTransaction } from './outbox-plan.js';
import type {
  CollectionItem,
  DeletePayload,
  UpdatePayload,
} from '../../domain/collection-item/index.js';
import {
  buildPacedUpdate,
  coalesceStrategy,
  type PaceStrategyFactory,
} from '../pacing/index.js';
import {
  changedFields,
  stripMeta,
} from '../../domain/collection-item/index.js';
import type { EffectRunner } from '../../platform/effect-runner/index.js';
import type { CollectionFlow } from '../../flow/sync-flow/index.js';

// Per-item onUpdate / onDelete callbacks of one transaction run this many at a time.
const MUTATION_CONCURRENCY = 5;

export const buildKeyedMutations = <
  S extends AnyEntityESchema,
  R = never,
>(args: {
  schema: S;
  collectionName: CollectionName;
  applyToSyncReplica: (
    entities: Entity<S['Type']>[],
  ) => Effect.Effect<void, WriteError>;
  onInsert?: (
    items: ReadonlyArray<S['Type']>,
  ) => Effect.Effect<ReadonlyArray<Entity<S['Type']>>, unknown, R>;
  onUpdate?: (
    payload: UpdatePayload<S['Type'], S>,
  ) => Effect.Effect<Entity<S['Type']>, unknown, R>;
  onDelete?: (
    payload: DeletePayload<S['Type']>,
  ) => Effect.Effect<Entity<S['Type']>, unknown, R>;
  pacing?: PaceStrategyFactory;
  outbox: OutboxRuntime | null;
  // Held closed while the Collection replays its Entries at mount.
  replayed: Effect.Effect<void>;
  runner: EffectRunner<R>;
  flow: () => CollectionFlow | null;
}) => {
  type TItem = S['Type'];
  type TCollItem = CollectionItem<TItem>;

  const {
    schema,
    collectionName,
    applyToSyncReplica,
    onInsert,
    onUpdate,
    onDelete,
    pacing,
    outbox,
    runner,
    flow,
  } = args;
  const handlerName = collectionHandlerName(collectionName);
  const outboxStory = () => narrateOutbox(flow()?.outbox ?? null);

  const withMutationSpan = <A, E, Req>(
    operation: 'delete' | 'insert' | 'update',
    keys: readonly string[],
    mutation: Effect.Effect<A, E, Req>,
  ): Effect.Effect<A, E, Req> => {
    const activeFlow = flow();
    return activeFlow
      ? mutation.pipe(
          activeFlow.collection.withSpan('Collection Mutation', {
            attributes: {
              collection: collectionName,
              ...(keys.length === 1 ? { entityKey: keys[0] } : {}),
              mutationCount: keys.length,
              operation,
              ...(outbox ? { outbox: true } : {}),
            },
          }),
        )
      : mutation;
  };

  const runConfirmed = (
    operation: 'delete' | 'insert' | 'update',
    keys: readonly string[],
    confirm: Effect.Effect<ReadonlyArray<Entity<TItem>>, unknown, R>,
  ): Promise<void> =>
    runner.runPromise(
      withMutationSpan(
        operation,
        keys,
        Effect.gen(function* () {
          const results = yield* confirm;
          yield* applyToSyncReplica([...results]);
        }),
      ),
    );

  const eachConfirmed = (
    effects: ReadonlyArray<Effect.Effect<Entity<TItem>, unknown, R>>,
  ) => Effect.all(effects, { concurrency: MUTATION_CONCURRENCY });

  const buildUpdatePayload = (
    current: TItem,
    updates: Partial<TItem>,
  ): UpdatePayload<TItem, S> =>
    ({ current, updates }) as UpdatePayload<TItem, S>;

  const codec = toSchema(schema);
  const encode = (item: TItem): Effect.Effect<unknown, unknown> =>
    Schema.encodeEffect(codec)(item);
  const decode = (value: unknown): Effect.Effect<TItem, unknown> =>
    Schema.decodeUnknownEffect(codec)(value);
  const valueOf = (item: TCollItem): TItem => stripMeta<TItem>(item);

  // A folded delete-then-insert names every key of the encoded body, `_v` too.
  const pick = <T>(after: T, changed: ReadonlyArray<string>): Partial<T> =>
    Object.fromEntries(
      changed
        .filter((field) => field !== schema.idField && field !== '_v')
        .map((field) => [field, (after as Record<string, unknown>)[field]]),
    ) as Partial<T>;

  const changes = <T extends object>(before: T, after: T): Partial<T> =>
    pick(after, changedFields(before, after));

  const updatePayload = (original: TCollItem, modified: TCollItem) => {
    const current = valueOf(original);
    return buildUpdatePayload(current, changes(current, valueOf(modified)));
  };

  const entityBody = (
    mutation: PendingMutation<TCollItem>,
  ): Effect.Effect<EntityBody, unknown> =>
    Effect.gen(function* () {
      const key = String(mutation.key);
      switch (mutation.type) {
        case 'insert':
          return {
            kind: 'entity',
            op: 'insert',
            key,
            base: null,
            after: yield* encode(valueOf(mutation.modified)),
            changed: [],
          };
        case 'update': {
          const base = valueOf(mutation.original as TCollItem);
          const after = valueOf(mutation.modified);
          return {
            kind: 'entity',
            op: 'update',
            key,
            base: yield* encode(base),
            after: yield* encode(after),
            changed: changedFields(base, after),
          };
        }
        case 'delete':
          return {
            kind: 'entity',
            op: 'delete',
            key,
            base: yield* encode(valueOf(mutation.original as TCollItem)),
            after: null,
            changed: [],
          };
      }
    });

  const runOutbox = (
    operation: 'delete' | 'insert' | 'update',
    transaction: Transaction<TCollItem>,
  ): Promise<void> => {
    const keys = transaction.mutations.map((mutation) => String(mutation.key));
    return runOutboxTransaction({
      runner,
      outbox: outbox!,
      story: outboxStory(),
      withMutationSpan: (mutation) =>
        withMutationSpan(operation, keys, mutation),
      transaction,
      buildEntry: (mutation, id) =>
        Effect.gen(function* () {
          return {
            id,
            name: handlerName,
            queue: queueKey(handlerName, String(mutation.key)),
            enqueuedAt: yield* nextUlid,
            body: yield* entityBody(mutation),
          };
        }),
    });
  };

  const send = (request: Request): Effect.Effect<void, unknown, R> =>
    Effect.gen(function* () {
      switch (request.op) {
        case 'nothing':
          return;
        case 'insert': {
          if (!onInsert) return yield* Effect.fail(missing('onInsert'));
          const value = yield* decode(request.value);
          const results = yield* onInsert([value]);
          yield* applyToSyncReplica([...results]);
          return;
        }
        case 'update': {
          if (!onUpdate) return yield* Effect.fail(missing('onUpdate'));
          const base = yield* decode(request.base);
          const after = yield* decode(request.after);
          const result = yield* onUpdate(
            buildUpdatePayload(base, pick(after, request.changed)),
          );
          yield* applyToSyncReplica([result]);
          return;
        }
        case 'delete': {
          if (!onDelete) return yield* Effect.fail(missing('onDelete'));
          const base = yield* decode(request.base);
          const result = yield* onDelete({ current: base });
          yield* applyToSyncReplica([result]);
          return;
        }
      }
    });

  const missing = (callback: string) =>
    new Error(`[sync] collection "${collectionName}" has no ${callback}`);

  if (outbox) {
    outbox.registerHandler(handlerName, {
      kind: 'entity',
      flow: flow()?.outbox ?? null,
      send: (request) =>
        args.replayed.pipe(Effect.andThen(runner.provide(send(request)))),
    });
  }

  const insertHandler = onInsert
    ? async ({
        transaction,
      }: InsertMutationFnParams<TCollItem, string>): Promise<void> => {
        if (outbox) return runOutbox('insert', transaction);
        await runConfirmed(
          'insert',
          transaction.mutations.map((mutation) => String(mutation.key)),
          onInsert(
            transaction.mutations.map((mutation) => valueOf(mutation.modified)),
          ),
        );
      }
    : undefined;

  const updateHandler = onUpdate
    ? async ({
        transaction,
      }: UpdateMutationFnParams<TCollItem, string>): Promise<void> => {
        if (outbox) return runOutbox('update', transaction);
        await runConfirmed(
          'update',
          transaction.mutations.map((mutation) => String(mutation.key)),
          eachConfirmed(
            transaction.mutations.map((mutation) =>
              onUpdate(updatePayload(mutation.original, mutation.modified)),
            ),
          ),
        );
      }
    : undefined;

  const deleteHandler = onDelete
    ? async ({
        transaction,
      }: DeleteMutationFnParams<TCollItem, string>): Promise<void> => {
        if (outbox) return runOutbox('delete', transaction);
        await runConfirmed(
          'delete',
          transaction.mutations.map((mutation) => String(mutation.key)),
          eachConfirmed(
            transaction.mutations.map((mutation) =>
              onDelete({ current: valueOf(mutation.original) }),
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
        const rows = new Map<string, TCollItem>();
        return (
          key: string,
          current: TCollItem,
          changes: Partial<TItem>,
          optimistic: (key: string, changes: Partial<TItem>) => void,
        ): Transaction<Partial<TItem>> => {
          if (!rows.has(key)) rows.set(key, current);
          let paced = mutate.get(key);
          if (!paced) {
            paced = buildPacedUpdate<Partial<TItem>>({
              strategy: (pacing ?? coalesceStrategy)(),
              optimistic: (next) => optimistic(key, next),
              commit: async (merged) => {
                const original = rows.get(key)!;
                rows.delete(key);
                await runConfirmed(
                  'update',
                  [key],
                  eachConfirmed([
                    onUpdate(
                      updatePayload(original, {
                        ...original,
                        ...merged,
                      } as TCollItem),
                    ),
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

  return {
    onInsert: insertHandler,
    onUpdate: updateHandler,
    onDelete: deleteHandler,
    pacedUpdate: makePacedUpdate(),
    decode,
    changes,
  };
};
