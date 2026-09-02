import type {
  DeleteMutationFnParams,
  InsertMutationFnParams,
  PendingMutation,
  Transaction,
  UpdateMutationFnParams,
} from '@tanstack/react-db';
import { Effect } from 'effect';
import { nextUlid, type DecodedEntity } from '../../../core/index.js';
import type { AnyEntityESchema } from '../../../eschema/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import {
  collectionHandlerName,
  type CollectionName,
} from '../../domain/identity/index.js';
import {
  narrateOutbox,
  queueKey,
  replayEntryId,
  type EntityBody,
  type OutboxRuntime,
  type Request,
} from '../../outbox/outbox/index.js';
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
  stripMeta,
  stripMetaPartial,
} from '../../domain/collection-item/index.js';
import type { EffectRunner } from '../../platform/effect-runner/index.js';
import type { CollectionFlow } from '../../worker/sync-flow/index.js';

// Per-item onUpdate / onDelete callbacks of one transaction run this many at a time.
const MUTATION_CONCURRENCY = 5;

export const buildKeyedMutations = <
  S extends AnyEntityESchema,
  R = never,
>(args: {
  schema: S;
  collectionName: CollectionName;
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
    confirm: Effect.Effect<ReadonlyArray<DecodedEntity<TItem>>, unknown, R>,
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
    effects: ReadonlyArray<Effect.Effect<DecodedEntity<TItem>, unknown, R>>,
  ) => Effect.all(effects, { concurrency: MUTATION_CONCURRENCY });

  const buildUpdatePayload = (
    current: TItem,
    updates: Partial<TItem>,
  ): UpdatePayload<TItem, S> =>
    ({ current, updates }) as UpdatePayload<TItem, S>;

  const changedKeys = (changes: Partial<TCollItem>): string[] =>
    Object.keys(stripMetaPartial<TItem>(changes));

  const encode = (item: TItem) =>
    schema.encode(item as never) as Effect.Effect<unknown, unknown>;
  const decode = (value: unknown) =>
    schema.decode(value) as Effect.Effect<TItem, unknown>;

  const pick = (after: TItem, changed: ReadonlyArray<string>): Partial<TItem> =>
    Object.fromEntries(
      changed
        .filter((field) => field !== schema.idField)
        .map((field) => [field, (after as Record<string, unknown>)[field]]),
    ) as Partial<TItem>;

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
            after: yield* encode(stripMeta<TItem>(mutation.modified)),
            changed: [],
          };
        case 'update':
          return {
            kind: 'entity',
            op: 'update',
            key,
            base: yield* encode(
              stripMeta<TItem>(mutation.original as TCollItem),
            ),
            after: yield* encode(stripMeta<TItem>(mutation.modified)),
            changed: changedKeys(mutation.changes as Partial<TCollItem>),
          };
        case 'delete':
          return {
            kind: 'entity',
            op: 'delete',
            key,
            base: yield* encode(
              stripMeta<TItem>(mutation.original as TCollItem),
            ),
            after: null,
            changed: [],
          };
      }
    });

  const runOutbox = (
    operation: 'delete' | 'insert' | 'update',
    transaction: Transaction<TCollItem>,
  ): Promise<void> => {
    const active = outbox!;
    const story = outboxStory();
    const keys = transaction.mutations.map((mutation) => String(mutation.key));
    return runner.runPromise(
      withMutationSpan(
        operation,
        keys,
        Effect.gen(function* () {
          const plans = yield* Effect.forEach(
            transaction.mutations,
            (mutation) =>
              Effect.gen(function* () {
                const replayId = replayEntryId(mutation.metadata);
                if (replayId !== null) return { id: replayId, entry: null };
                const id = mutation.mutationId;
                return {
                  id,
                  entry: {
                    id,
                    name: handlerName,
                    queue: queueKey(handlerName, String(mutation.key)),
                    enqueuedAt: yield* nextUlid,
                    body: yield* entityBody(mutation),
                  },
                };
              }),
          );
          const ids = plans.map((plan) => plan.id);
          const batch = plans.flatMap((plan) =>
            plan.entry ? [plan.entry] : [],
          );
          yield* story.queue(
            {
              entryIds: ids,
              replayed: plans.some((plan) => plan.entry === null),
            },
            batch.length === 0
              ? Effect.void
              : story.enqueue(batch, active.enqueue(batch)),
            // Concurrent so every Entry's transaction is known at once.
            Effect.forEach(
              ids,
              (id) => active.delivered(id, transaction as Transaction),
              { concurrency: 'unbounded', discard: true },
            ),
          );
        }),
      ),
    );
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
        if (outbox) return runOutbox('update', transaction);
        await runConfirmed(
          'update',
          transaction.mutations.map((mutation) => String(mutation.key)),
          eachConfirmed(
            transaction.mutations.map((mutation) =>
              onUpdate(
                buildUpdatePayload(
                  stripMeta(mutation.original),
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
        if (outbox) return runOutbox('delete', transaction);
        await runConfirmed(
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
              strategy: (pacing ?? coalesceStrategy)(),
              optimistic: (next) => optimistic(key, next),
              commit: async (merged) => {
                const updates = stripMetaPartial<TItem>(merged);
                await runConfirmed(
                  'update',
                  [key],
                  eachConfirmed([
                    onUpdate(
                      buildUpdatePayload(stripMeta(rows.get(key)!), updates),
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
    pick,
  };
};
