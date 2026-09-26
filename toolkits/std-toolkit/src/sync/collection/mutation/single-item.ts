import type {
  PendingMutation,
  Transaction,
  UpdateMutationFnParams,
} from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import {
  nextUlid,
  type Entity,
  type SingletonEntity,
} from '../../../core/index.js';
import { toSchema, type AnyUnkeyedESchema } from '../../../eschema/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import {
  collectionHandlerName,
  type CollectionName,
} from '../../domain/identity/index.js';
import {
  narrateOutbox,
  queueKey,
  type OutboxRuntime,
  type Request,
} from '../../outbox/outbox/index.js';
import { runOutboxTransaction } from './outbox-plan.js';
import type { CollectionItem } from '../../domain/collection-item/index.js';
import {
  buildPacedUpdate,
  coalesceStrategy,
  type PaceStrategyFactory,
} from '../pacing/index.js';
import {
  changedFields,
  stripMeta,
  toEntity,
} from '../../domain/collection-item/index.js';
import type { EffectRunner } from '../../platform/effect-runner/index.js';
import type { CollectionFlow } from '../../flow/sync-flow/index.js';

export const SINGLE_ITEM_KEY = '__single__';

export const buildSingleItemMutations = <
  S extends AnyUnkeyedESchema,
  R = never,
>(args: {
  schema: S;
  collectionName: CollectionName;
  applyToSyncReplica: (
    entities: Entity<S['Type']>[],
  ) => Effect.Effect<void, WriteError>;
  onUpdate?:
    | ((payload: {
        updates: Partial<S['Type']>;
      }) => Effect.Effect<SingletonEntity<S['Type']>, unknown, R>)
    | undefined;
  pacing?: PaceStrategyFactory | undefined;
  outbox: OutboxRuntime | null;
  // Held closed while the Collection replays its Entries at mount.
  replayed: Effect.Effect<void>;
  runner: EffectRunner<R>;
  flow: () => CollectionFlow | null;
  current: () => CollectionItem<S['Type']> | undefined;
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
        .filter((field) => field !== '_v')
        .map((field) => [field, (after as Record<string, unknown>)[field]]),
    ) as Partial<T>;

  const changes = <T extends object>(before: T, after: T): Partial<T> =>
    pick(after, changedFields(before, after));

  const runUpdate = (original: TCollItem, modified: TCollItem): Promise<void> =>
    runner.runPromise(
      withMutationSpan(
        Effect.gen(function* () {
          const result = yield* onUpdate!({
            updates: changes(valueOf(original), valueOf(modified)),
          });
          yield* applyToSyncReplica([toEntity(result)]);
        }),
      ),
    );

  const runOutbox = (transaction: Transaction<TCollItem>): Promise<void> =>
    runOutboxTransaction({
      runner,
      outbox: outbox!,
      story: outboxStory(),
      withMutationSpan,
      transaction,
      buildEntry: (mutation: PendingMutation<TCollItem>, id) =>
        Effect.gen(function* () {
          const base = valueOf(mutation.original as TCollItem);
          const after = valueOf(mutation.modified);
          return {
            id,
            name: handlerName,
            queue: queueKey(handlerName, SINGLE_ITEM_KEY),
            enqueuedAt: yield* nextUlid,
            body: {
              kind: 'entity' as const,
              op: 'update' as const,
              key: SINGLE_ITEM_KEY,
              base: yield* encode(base),
              after: yield* encode(after),
              changed: changedFields(base, after),
            },
          };
        }),
    });

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
        await runUpdate(mutation.original as TCollItem, mutation.modified);
      }
    : undefined;

  const makePacedUpdate = onUpdate
    ? () => {
        let paced:
          | ((changes: Partial<TItem>) => Transaction<Partial<TItem>>)
          | null = null;
        let base: TCollItem | undefined;
        return (
          next: Partial<TItem>,
          optimistic: (changes: Partial<TItem>) => void,
        ): Transaction<Partial<TItem>> => {
          base ??= args.current();
          if (!paced) {
            paced = buildPacedUpdate<Partial<TItem>>({
              strategy: (pacing ?? coalesceStrategy)(),
              optimistic,
              commit: (merged) => {
                const original = base!;
                base = undefined;
                return runUpdate(original, {
                  ...original,
                  ...merged,
                } as TCollItem);
              },
            });
          }
          return paced(next);
        };
      }
    : () => (): Transaction<Partial<TItem>> => {
        throw new Error('pacedUpdate requires onUpdate to be defined');
      };

  return {
    onUpdate: updateHandler,
    pacedUpdate: makePacedUpdate(),
    decode,
    changes,
  };
};
