import {
  initFlow,
  type ActivationRef,
  type MessageToken,
} from '@pkishorez/effect-tracer/flow';
import { Effect } from 'effect';
import type { PartitionValue } from '../../domain/partition-identity/index.js';
import {
  partitionSyncAddress,
  strategySyncAddress,
} from '../../domain/sync-address/index.js';

export type ActivationOutcome = Parameters<ActivationRef['end']>[0];

type FlowLogOptions = {
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly level?: 'debug' | 'error' | 'info' | 'warning';
};

export type StrategyFlow = {
  log: (message: unknown, options?: FlowLogOptions) => Effect.Effect<void>;
  withSpan: (
    name: string,
    options?: {
      readonly attributes?: Readonly<Record<string, unknown>>;
    },
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
};

export type FlowParticipant = StrategyFlow & {
  readonly name: string;
  send: (
    participantName: string,
    message: unknown,
    options?: FlowLogOptions,
  ) => Effect.Effect<MessageToken>;
  reply: (
    token: MessageToken,
    message: unknown,
    options?: FlowLogOptions,
  ) => Effect.Effect<void>;
  activation: {
    start: (name?: unknown) => Effect.Effect<ActivationRef>;
  };
  activated: (
    name: string,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
};

export type CollectionFlow = {
  readonly id: string;
  readonly collection: FlowParticipant;
  participant: (name: string) => FlowParticipant;
};

export type FlowPlacement = {
  readonly id: string;
  readonly participantPrefix: string;
};

const participant = (id: string, name: string): FlowParticipant => {
  const flow = initFlow({ id, participantName: name });
  return {
    name,
    activated: (activationName) => flow.activated({ name: activationName }),
    activation: { start: flow.activation.start },
    log: flow.log,
    reply: flow.reply,
    send: flow.send,
    withSpan: flow.withSpan,
  };
};

export const makeCollectionFlow = (
  collectionAddress: string,
  lifecycleId: string,
  placement?: FlowPlacement,
): CollectionFlow => {
  const id = placement?.id ?? `${collectionAddress}::${lifecycleId}`;
  const collectionName = placement
    ? `${placement.participantPrefix}/${collectionAddress}`
    : collectionAddress;
  const qualify = (name: string) =>
    name === 'collection' ? collectionName : `${collectionName}/${name}`;
  const participants = new Map<string, FlowParticipant>();
  const getParticipant = (name: string) => {
    const qualified = qualify(name);
    const existing = participants.get(qualified);
    if (existing) return existing;
    const created = participant(id, qualified);
    participants.set(qualified, created);
    return created;
  };
  const collection = getParticipant('collection');

  return {
    id,
    collection,
    participant: getParticipant,
  };
};

export const narrateHydration = (
  narrator: StrategyFlow | undefined,
  collection: string,
) => ({
  load: <A extends { readonly rows: number }, E, R>(
    from: string | null,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    narrator
      ? effect.pipe(
          Effect.tap((read) =>
            Effect.logInfo(`Read ${read.rows} rows from the Sync Replica`).pipe(
              Effect.annotateLogs({
                rows: read.rows,
                since: from ?? 'the beginning',
              }),
            ),
          ),
          narrator.withSpan('Load Sync Replica', {
            attributes: { collection },
          }),
        )
      : effect,
  project: <A, E, R>(
    rows: number,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    narrator
      ? effect.pipe(
          Effect.tap(() =>
            Effect.logInfo(`Projected ${rows} rows into the Collection`),
          ),
          narrator.withSpan('Project into Collection', {
            attributes: { collection, rows },
          }),
        )
      : effect,
});

export const narrateReplicaWrite = (
  narrator: StrategyFlow | undefined,
  collection: string,
) => ({
  write: <A extends readonly unknown[], E, R>(
    received: number,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    narrator
      ? effect.pipe(
          Effect.tap((accepted) => {
            const skipped = received - accepted.length;
            return Effect.logInfo(
              skipped === 0
                ? `Stored ${accepted.length} new rows in the Sync Replica`
                : `Stored ${accepted.length} of ${received} rows in the Sync Replica (${skipped} already current)`,
            ).pipe(
              Effect.annotateLogs({
                received,
                stored: accepted.length,
                alreadyCurrent: skipped,
              }),
            );
          }),
          narrator.withSpan('Write to Sync Replica', {
            attributes: { collection, rows: received },
          }),
        )
      : effect,
  broadcast: <A, E, R>(
    rows: number,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    narrator
      ? effect.pipe(
          Effect.tap(() =>
            Effect.logInfo(`Broadcast ${rows} rows to peer tabs`),
          ),
          narrator.withSpan('Broadcast to peers', {
            attributes: { collection, rows },
          }),
        )
      : effect,
});

export const globalParticipantName = (strategyName: string) =>
  strategySyncAddress('{global}', strategyName);

export const partitionParticipantName = (
  partition: { field: string; value: PartitionValue },
  strategyName: string,
) => strategySyncAddress(partitionSyncAddress('', partition), strategyName);

export const cadenceParticipantName = (partition?: {
  field: string;
  value: PartitionValue;
}) =>
  partition
    ? strategySyncAddress(partitionSyncAddress('', partition), 'cadence-repair')
    : strategySyncAddress('{global}', 'cadence-repair');

export const singleItemParticipantName = (strategyName: string) =>
  strategySyncAddress('{global}', strategyName);
