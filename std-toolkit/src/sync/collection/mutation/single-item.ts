import type {
  PendingMutation,
  Transaction,
  UpdateMutationFnParams,
} from '@tanstack/react-db';
import { Effect } from 'effect';
import {
  nextUlid,
  type DecodedEntity,
  type DecodedSingleEntity,
} from '../../../core/index.js';
import type { AnyUnkeyedESchema } from '../../../eschema/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import {
  collectionHandlerName,
  type CollectionName,
} from '../../domain/identity/index.js';
import {
  narrateOutbox,
  queueKey,
  replayEntryId,
  type OutboxRuntime,
  type Request,
} from '../../outbox/outbox/index.js';
import type { CollectionItem } from '../../domain/collection-item/index.js';
import {
  buildPacedUpdate,
  coalesceStrategy,
  type PaceStrategyFactory,
} from '../pacing/index.js';
import {
  stripMeta,
  stripMetaPartial,
  toEntity,
} from '../../domain/collection-item/index.js';
import type { EffectRunner } from '../../platform/effect-runner/index.js';
import type { CollectionFlow } from '../../worker/sync-flow/index.js';

export const SINGLE_ITEM_KEY = '__single__';

export const buildSingleItemMutations = <
  S extends AnyUnkeyedESchema,
  R = never,
>(args: {
  schema: S;
  collectionName: CollectionName;
  applyToSyncReplica: (
    entities: DecodedEntity<S['Type']>[],
  ) => Effect.Effect<void, WriteError>;
  onUpdate?:
    | ((payload: {
        updates: Partial<S['Type']>;
      }) => Effect.Effect<DecodedSingleEntity<S['Type']>, unknown, R>)
    | undefined;
  pacing?: PaceStrategyFactory | undefined;
  outbox: OutboxRuntime | null;
  // Held closed while the Collection replays its Entries at mount.
  replayed: Effect.Effect<void>;
  runner: EffectRunner<R>;
  flow: () => CollectionFlow | null;
}) => {
  type TItem = S['Type'];
  type TCollItem = CollectionItem<TItem>;
  const { schema, collectionName, applyToSyncReplica, onUpdate, pacing } = args;
  const { outbox, runner, flow } = args;
  const handlerName = collectionHandlerName(collectionName);
  const outboxStory = () => narrateOutbox(flow()?.outbox ?? null);

  const withMutationSpan = <A, E, Req>(
    mutation: Effect.Effect<A, E, Req>,
  ): Effect.Effect<A, E, Req> => {
    const activeFlow = flow();
    return activeFlow
      ? mutation.pipe(
          activeFlow.collection.withSpan('Collection Mutation', {
            attributes: {
              collection: collectionName,
              operation: 'update',
              ...(outbox ? { outbox: true } : {}),
            },
          }),
        )
      : mutation;
  };

  const runUpdate = (updates: Partial<TItem>): Promise<void> =>
    runner.runPromise(
      withMutationSpan(
        Effect.gen(function* () {
          const result = yield* onUpdate!({ updates });
          yield* applyToSyncReplica([toEntity(result)]);
        }),
      ),
    );

  const encode = (item: TItem) =>
    schema.encode(item as never) as Effect.Effect<unknown, unknown>;
  const decode = (value: unknown) =>
    schema.decode(value) as Effect.Effect<TItem, unknown>;

  const pick = (after: TItem, changed: ReadonlyArray<string>): Partial<TItem> =>
    Object.fromEntries(
      changed.map((field) => [
        field,
        (after as Record<string, unknown>)[field],
      ]),
    ) as Partial<TItem>;

  const runOutbox = (transaction: Transaction<TCollItem>): Promise<void> => {
    const active = outbox!;
    const story = outboxStory();
    return runner.runPromise(
      withMutationSpan(
        Effect.gen(function* () {
          const plans = yield* Effect.forEach(
            transaction.mutations,
            (mutation: PendingMutation<TCollItem>) =>
              Effect.gen(function* () {
                const replayId = replayEntryId(mutation.metadata);
                if (replayId !== null) return { id: replayId, entry: null };
                const id = mutation.mutationId;
                return {
                  id,
                  entry: {
                    id,
                    name: handlerName,
                    queue: queueKey(handlerName, SINGLE_ITEM_KEY),
                    enqueuedAt: yield* nextUlid,
                    body: {
                      kind: 'entity' as const,
                      op: 'update' as const,
                      key: SINGLE_ITEM_KEY,
                      base: yield* encode(
                        stripMeta<TItem>(mutation.original as TCollItem),
                      ),
                      after: yield* encode(stripMeta<TItem>(mutation.modified)),
                      changed: Object.keys(
                        stripMetaPartial<TItem>(
                          mutation.changes as Partial<TCollItem>,
                        ),
                      ),
                    },
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
      if (request.op !== 'update') return;
      if (!onUpdate) {
        return yield* Effect.fail(
          new Error(`[sync] collection "${collectionName}" has no onUpdate`),
        );
      }
      const after = yield* decode(request.after);
      const result = yield* onUpdate({ updates: pick(after, request.changed) });
      yield* applyToSyncReplica([toEntity(result)]);
    });

  if (outbox) {
    outbox.registerHandler(handlerName, {
      kind: 'entity',
      flow: flow()?.outbox ?? null,
      send: (request) =>
        args.replayed.pipe(Effect.andThen(runner.provide(send(request)))),
    });
  }

  const updateHandler = onUpdate
    ? async ({
        transaction,
      }: UpdateMutationFnParams<TCollItem, string>): Promise<void> => {
        if (outbox) return runOutbox(transaction);
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
              strategy: (pacing ?? coalesceStrategy)(),
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
    decode,
    pick,
  };
};
