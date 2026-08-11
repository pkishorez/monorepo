import { Effect, Exit, Scope } from 'effect';
import type { EntityType } from '../../../core/index.js';
import type { WriteError } from '../../domain/sync-error/index.js';
import type { CadenceConfig } from '../../domain/cadence-policy/index.js';
import type {
  PartitionEntry,
  PartitionedStrategy,
  StrategyContext,
} from '../../runtime/strategy-runtime/index.js';
import {
  runCadenceSync,
  type SyncCollection,
} from '../../workers/cadence-repair/index.js';
import { superviseStrategy } from '../strategy-lifecycle/index.js';
import type { SyncReporter } from '../../domain/sync-event/index.js';
import type { PartitionValue } from '../../domain/partition-identity/index.js';

export type SyncExecution<TItem extends object, R> = {
  start: (
    partitionKey: string,
    entry: PartitionEntry<TItem, R, any>,
    partition?: { field: string; value: PartitionValue },
  ) => Effect.Effect<void, never, R>;
  stop: (partitionKey: string) => Effect.Effect<void>;
  stopAll: Effect.Effect<void>;
};

export const makeSyncExecution = <TItem extends object, R>(args: {
  collectionName: string;
  defaultCadence?: CadenceConfig;
  collection: () => SyncCollection<TItem> | null;
  makeContext: <TState>(
    partitionKey: string,
    scope: Scope.Scope,
    strategy: PartitionedStrategy<TItem, TState, R>,
  ) => StrategyContext<TItem, TState>;
  writeServerTruth: (
    entities: EntityType<TItem>[],
  ) => Effect.Effect<void, WriteError>;
  report: SyncReporter<R>;
}): Effect.Effect<SyncExecution<TItem, R>> =>
  Effect.sync(() => {
    const scopes = new Map<string, Scope.Closeable>();

    const stop = (partitionKey: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const scope = scopes.get(partitionKey);
        if (!scope) return;
        scopes.delete(partitionKey);
        yield* Scope.close(scope, Exit.void);
      });

    const start: SyncExecution<TItem, R>['start'] = (
      partitionKey,
      entry,
      partition,
    ) =>
      Effect.gen(function* () {
        yield* stop(partitionKey);
        const ownerScope = yield* Scope.make();
        scopes.set(partitionKey, ownerScope);

        const strategyRun = superviseStrategy({
          run: (attemptScope) =>
            entry.strategy.run(
              args.makeContext(partitionKey, attemptScope, entry.strategy),
            ),
          onError: (cause) =>
            args.report({
              _tag: 'StrategyFailed',
              collection: args.collectionName,
              partitionKey,
              strategy: entry.strategy.name,
              cause,
            }),
          onDefect: (cause) =>
            args.report({
              _tag: 'StrategyDefect',
              collection: args.collectionName,
              partitionKey,
              strategy: entry.strategy.name,
              cause,
            }),
        });
        yield* Effect.forkIn(strategyRun, ownerScope);

        const repair = entry.repair;
        const cadence = repair?.cadence ?? args.defaultCadence;
        const collection = args.collection();
        if (repair && cadence && collection) {
          const cadenceRun = superviseStrategy({
            run: () =>
              runCadenceSync({
                collection,
                fetchFrom: (cursor) => repair.fetchFrom({ cursor }),
                writeServerTruth: args.writeServerTruth,
                partition,
                config: cadence,
              }),
            onError: (cause) =>
              args.report({
                _tag: 'CadenceFailed',
                collection: args.collectionName,
                partitionKey,
                cause,
              }),
            onDefect: (cause) =>
              args.report({
                _tag: 'CadenceDefect',
                collection: args.collectionName,
                partitionKey,
                cause,
              }),
          });
          yield* Effect.forkIn(cadenceRun, ownerScope);
        }
      });

    return {
      start,
      stop,
      stopAll: Effect.gen(function* () {
        const closes = [...scopes.values()].map((scope) =>
          Scope.close(scope, Exit.void),
        );
        scopes.clear();
        yield* Effect.all(closes, { concurrency: 'unbounded' });
      }).pipe(Effect.asVoid),
    };
  });
