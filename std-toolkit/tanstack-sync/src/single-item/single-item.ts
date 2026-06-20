import type {
  CollectionConfig,
  SingleResult,
  SyncConfig,
  Transaction,
} from '@tanstack/react-db';
import { Duration, Effect, Exit, Fiber, Option, Schedule, Scope } from 'effect';
import type { EntityType, SingleEntityType } from '@std-toolkit/core';
import type { AnySingleEntityESchema } from '@std-toolkit/eschema';
import { makeCollectionProjector } from '../collection-projection/index.js';
import { converge } from '../source-of-truth/index.js';
import type { Accepted } from '../source-of-truth/index.js';
import type { WriteError } from '../source-of-truth/write-error.js';
import type { CollectionHandle, Tracker } from '../registry/tracker.js';
import type { StrategyContext } from '../partitioned/strategies/interface.js';
import type { CollectionItem, StdCollectionOptions } from '../types.js';
import { buildMutationHandlers } from './mutations.js';
import type { SingleItemStrategy } from './strategies/interface.js';
import type { PaceStrategyFactory } from '../paced/pace-strategy.js';

/**
 * The mounted-collection result a single-item collection produces: a TanStack
 * `CollectionConfig` plus engine-owned `utils` (schema, write, mutation handlers).
 * Unlike the keyed engine there is no `sync` util key — the single-item family has
 * collection-level lifecycle only. The `& SingleResult` marker (`singleResult: true` in
 * the config) makes `useLiveQuery` surface `data` as the single row (`TItem | undefined`)
 * rather than a one-element array.
 */
export type SingleItemResult<
  TItem extends object,
  S extends AnySingleEntityESchema,
> = CollectionConfig<CollectionItem<TItem>, string> &
  SingleResult & {
    utils: {
      schema: () => S;
      writeServerTruth: (
        entities: EntityType<TItem>[],
      ) => Effect.Effect<void, WriteError>;
      onUpdate?: NonNullable<
        ReturnType<typeof buildMutationHandlers<TItem>>['onUpdate']
      >;
      pacedUpdate: (changes: Record<string, unknown>) => Transaction;
      pendingCount: () => number;
      subscribePending: (listener: () => void) => () => void;
    };
  };

/**
 * Convergence-guarded singleton cell: the single-item equivalent of the keyed SoT.
 * `write` converges the incoming entity against the retained cell (a slow response
 * can't overwrite a newer `_u`), returning the accepted delta. The cell + its value
 * survive unmount; only the projector is torn down on cleanup.
 */
const makeSingletonCell = <TItem>(key: string) => {
  let cell: Option.Option<EntityType<TItem>> = Option.none();
  return {
    write: (
      entity: EntityType<TItem>,
    ): Effect.Effect<Accepted<TItem>, WriteError> =>
      Effect.sync(() => {
        const current = Option.getOrNull(cell);
        if (converge(current, entity) === 'skip') {
          return { upserts: [], tombstoned: [] };
        }
        cell = Option.some(entity);
        return { upserts: [entity], tombstoned: [] };
      }),
    current: (): Effect.Effect<EntityType<TItem>[]> =>
      Effect.sync(() =>
        Option.match(cell, { onNone: () => [], onSome: (e) => [e] }),
      ),
    key,
  };
};

/**
 * Builds a mounted single-item collection. The strategy runs against a singleton
 * SoT cell with collection-level lifecycle only — no partitions, no `loadSubset`.
 * On mount the projector backfills the retained cell, opens one collection-level
 * scope, and forks the retry-wrapped `strategy.run`; on unmount the scope closes and
 * the projector is nulled (cell + state survive). A `CollectionHandle` is registered
 * so the registry can target single-item collections.
 */
export const buildSingleItem = <S extends AnySingleEntityESchema>(
  tracker: Tracker,
  config: {
    schema: S;
    strategy: SingleItemStrategy<S['Type']>;
    options?: StdCollectionOptions;
    onUpdate?: (payload: {
      updates: Partial<S['Type']>;
    }) => Effect.Effect<SingleEntityType<S['Type']>>;
    updatePacing?: PaceStrategyFactory;
  },
): SingleItemResult<S['Type'], S> => {
  type TItem = S['Type'];

  const { schema, strategy, options, onUpdate, updatePacing } = config;
  const cell = makeSingletonCell<TItem>(schema.name);

  type Projector = ReturnType<typeof makeCollectionProjector<TItem>>;
  let projector: Projector | null = null;
  let collectionUpdate:
    | ((updater: (draft: CollectionItem<TItem>) => void) => Transaction)
    | null = null;

  const project = (accepted: Accepted<TItem>): void => {
    if (projector) projector.project(accepted);
  };

  const writeServerTruth = (
    entities: EntityType<TItem>[],
  ): Effect.Effect<void, WriteError> =>
    Effect.gen(function* () {
      for (const entity of entities) {
        const accepted = yield* cell.write(entity);
        project(accepted);
      }
    });

  const projectOnly = (
    entities: EntityType<TItem>[],
  ): Effect.Effect<void, WriteError> =>
    Effect.sync(() => project({ upserts: entities, tombstoned: [] }));

  const handle: CollectionHandle = {
    schemaName: schema.name,
    writeServerTruth: writeServerTruth as CollectionHandle['writeServerTruth'],
    projectOnly: projectOnly as CollectionHandle['projectOnly'],
  };
  tracker.register(handle);

  const handlers = buildMutationHandlers<TItem>({
    writeServerTruth,
    onUpdate,
    updatePacing,
  });

  const sync: SyncConfig<CollectionItem<TItem>, string>['sync'] = (
    callbacks,
  ) => {
    const local = makeCollectionProjector<TItem>(callbacks);
    projector = local;
    collectionUpdate = (updater) =>
      callbacks.collection.update(schema.name, updater);

    const run = Effect.runPromise(
      Effect.gen(function* () {
        const entities = yield* cell.current();
        local.projectAll(entities);

        const scope = yield* Scope.make();

        const ctx: StrategyContext<TItem> = {
          writeServerTruth,
          getState: Effect.succeed(null),
          setState: () => Effect.void,
          scope,
        };

        const guarded = strategy.run(ctx).pipe(
          Effect.tapError((error) =>
            Effect.sync(() =>
              console.error(
                `[std-sync] single-item strategy "${schema.name}" failed; restarting`,
                error,
              ),
            ),
          ),
          Effect.retry(Schedule.spaced(Duration.seconds(2))),
          Scope.provide(scope),
        );

        const fiber = yield* Effect.forkIn(guarded, scope);
        callbacks.markReady();
        return { scope, fiber };
      }),
    );

    return {
      cleanup: async () => {
        const { scope, fiber } = await run;
        await Effect.runPromise(Fiber.interrupt(fiber));
        await Effect.runPromise(Scope.close(scope, Exit.void));
        projector = null;
        collectionUpdate = null;
      },
    };
  };

  return {
    ...(options as object),
    rowUpdateMode: 'full',
    singleResult: true,
    getKey: () => schema.name,
    sync: { sync },
    onUpdate: handlers.onUpdate,
    utils: {
      schema: () => schema,
      writeServerTruth,
      onUpdate: handlers.onUpdate,
      pacedUpdate: (changes: Record<string, unknown>) =>
        handlers.pacedUpdate(changes as Partial<TItem>, (next) => {
          collectionUpdate?.((draft) => {
            Object.assign(draft, next);
          });
        }),
      pendingCount: handlers.pendingCount,
      subscribePending: handlers.subscribePending,
    },
  } as SingleItemResult<TItem, S>;
};
