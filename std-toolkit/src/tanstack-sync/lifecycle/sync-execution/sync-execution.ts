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
import {
  cadenceParticipantName,
  globalParticipantName,
  partitionParticipantName,
  type CollectionFlow,
  type FlowParticipant,
  type StrategyFlow,
} from '../../runtime/sync-flow/index.js';

export type SyncExecution<TItem extends object, R> = {
  start: (
    partitionKey: string,
    entry: PartitionEntry<TItem, R, any>,
    flow: CollectionFlow,
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
    flow: StrategyFlow,
  ) => StrategyContext<TItem, TState>;
  writeServerTruth: (
    entities: EntityType<TItem>[],
    flow?: StrategyFlow,
  ) => Effect.Effect<void, WriteError>;
  report: SyncReporter<R>;
}): Effect.Effect<SyncExecution<TItem, R>> =>
  Effect.sync(() => {
    const running = new Map<
      string,
      {
        scope: Scope.Closeable;
        flow: CollectionFlow;
        strategy: FlowParticipant;
        cadence?: FlowParticipant;
      }
    >();

    const stop = (partitionKey: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const active = running.get(partitionKey);
        if (!active) return;
        running.delete(partitionKey);
        yield* active.flow.collection.send(active.strategy.name, 'Sync stop', {
          attributes: { partitionKey },
        });
        yield* active.strategy.log('Sync cleanup', {
          attributes: { partitionKey },
        });
        if (active.cadence) {
          yield* active.flow.collection.send(
            active.cadence.name,
            'Cadence stop',
            { attributes: { partitionKey } },
          );
          yield* active.cadence.log('Cadence cleanup', {
            attributes: { partitionKey },
          });
        }
        yield* Scope.close(active.scope, Exit.void);
        yield* active.strategy.log('Sync end', {
          attributes: { partitionKey },
        });
        if (active.cadence) {
          yield* active.cadence.log('Cadence end', {
            attributes: { partitionKey },
          });
        }
      });

    const start: SyncExecution<TItem, R>['start'] = (
      partitionKey,
      entry,
      flow,
      partition,
    ) =>
      Effect.gen(function* () {
        yield* stop(partitionKey);
        const ownerScope = yield* Scope.make();
        const strategyName = partition
          ? partitionParticipantName(partition, entry.strategy.name)
          : globalParticipantName(entry.strategy.name);
        const strategyFlow = flow.participant(strategyName);
        const attributes = {
          collection: args.collectionName,
          partitionKey,
          strategy: entry.strategy.name,
          ...(partition
            ? {
                partitionField: partition.field,
                partitionValue: partition.value,
              }
            : {}),
        };

        yield* flow.collection.send(strategyFlow.name, 'Sync start', {
          attributes,
        });
        yield* strategyFlow.log('Sync start', { attributes });

        const strategyRun = superviseStrategy({
          run: (attemptScope) =>
            entry.strategy
              .run(
                args.makeContext(
                  partitionKey,
                  attemptScope,
                  entry.strategy,
                  strategyFlow,
                ),
              )
              .pipe(
                strategyFlow.withSpan('Strategy attempt', { attributes }),
                Effect.tap(() =>
                  strategyFlow.log('Strategy success', { attributes }),
                ),
              ),
          onError: (cause) =>
            strategyFlow
              .log('Strategy failure', {
                attributes: { ...attributes, cause: String(cause) },
                level: 'error',
              })
              .pipe(
                Effect.andThen(
                  args.report({
                    _tag: 'StrategyFailed',
                    collection: args.collectionName,
                    partitionKey,
                    strategy: entry.strategy.name,
                    cause,
                  }),
                ),
              ),
          onDefect: (cause) =>
            strategyFlow
              .log('Strategy defect', {
                attributes: { ...attributes, cause: String(cause) },
                level: 'error',
              })
              .pipe(
                Effect.andThen(
                  args.report({
                    _tag: 'StrategyDefect',
                    collection: args.collectionName,
                    partitionKey,
                    strategy: entry.strategy.name,
                    cause,
                  }),
                ),
              ),
        });
        yield* Effect.forkIn(strategyRun, ownerScope);

        const repair = entry.repair;
        const cadence = repair?.cadence ?? args.defaultCadence;
        const collection = args.collection();
        let cadenceFlow: FlowParticipant | undefined;
        if (repair && cadence && collection) {
          cadenceFlow = flow.participant(cadenceParticipantName(partition));
          yield* flow.collection.send(cadenceFlow.name, 'Cadence start', {
            attributes,
          });
          yield* cadenceFlow.log('Cadence start', { attributes });
          const cadenceRun = superviseStrategy({
            run: () =>
              runCadenceSync({
                collection,
                fetchFrom: (cursor) => repair.fetchFrom({ cursor }),
                writeServerTruth: (entities) =>
                  args.writeServerTruth(entities, cadenceFlow),
                partition,
                config: cadence,
              }).pipe(cadenceFlow!.withSpan('Cadence attempt', { attributes })),
            onError: (cause) =>
              cadenceFlow!
                .log('Cadence failure', {
                  attributes: { ...attributes, cause: String(cause) },
                  level: 'error',
                })
                .pipe(
                  Effect.andThen(
                    args.report({
                      _tag: 'CadenceFailed',
                      collection: args.collectionName,
                      partitionKey,
                      cause,
                    }),
                  ),
                ),
            onDefect: (cause) =>
              cadenceFlow!
                .log('Cadence defect', {
                  attributes: { ...attributes, cause: String(cause) },
                  level: 'error',
                })
                .pipe(
                  Effect.andThen(
                    args.report({
                      _tag: 'CadenceDefect',
                      collection: args.collectionName,
                      partitionKey,
                      cause,
                    }),
                  ),
                ),
          });
          yield* Effect.forkIn(cadenceRun, ownerScope);
        }
        running.set(partitionKey, {
          scope: ownerScope,
          flow,
          strategy: strategyFlow,
          ...(cadenceFlow ? { cadence: cadenceFlow } : {}),
        });
      });

    return {
      start,
      stop,
      stopAll: Effect.gen(function* () {
        yield* Effect.all([...running.keys()].map(stop), {
          concurrency: 'unbounded',
        });
      }).pipe(Effect.asVoid),
    };
  });
