import {
  Flow,
  type ActivationRef,
  type EntryOptions,
  type MessageToken,
  type Participant,
} from '@pkishorez/flow';
import { Effect } from 'effect';
import {
  partitionSyncAddress,
  strategySyncAddress,
  type PartitionValue,
} from '../../domain/identity/index.js';

export type ActivationOutcome = Parameters<ActivationRef['end']>[0];

export type FlowEntryOptions = EntryOptions;

/** What a Strategy or a narrator may record: Events and named spans. */
export type StrategyFlow = {
  event: (name: string, options?: FlowEntryOptions) => Effect.Effect<void>;
  withSpan: (
    name: string,
    options?: {
      readonly attributes?: Readonly<Record<string, unknown>>;
    },
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
};

/** One Sync lane: a Flow Participant plus a span helper that names the lane. */
export type FlowParticipant = StrategyFlow & {
  readonly name: string;
  send: (
    participantName: string,
    name: string,
    options?: FlowEntryOptions,
  ) => Effect.Effect<MessageToken>;
  reply: (
    token: MessageToken,
    name: string,
    options?: FlowEntryOptions,
  ) => Effect.Effect<void>;
  activation: {
    start: (
      name: string,
      options?: FlowEntryOptions,
    ) => Effect.Effect<ActivationRef>;
  };
  activated: (
    name: string,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
};

export type OutboxFlow = {
  readonly collection: FlowParticipant;
  readonly outbox: FlowParticipant;
  readonly drainer: FlowParticipant;
};

export type CollectionFlow = {
  readonly id: string;
  readonly collection: FlowParticipant;
  readonly outbox: OutboxFlow;
  participant: (name: string) => FlowParticipant;
};

export type FlowPlacement = {
  readonly id: string;
  readonly participantPrefix: string;
};

// One Flow per Std Sync: the sync is the root participant, every collection
// hangs under it, and one Drainer serves them all.
export type FlowLane = Participant;

export type SyncFlow = {
  readonly id: string;
  readonly sync: FlowParticipant;
  readonly outbox: FlowParticipant;
  readonly drainer: FlowParticipant;
  collection: (localName: string) => CollectionFlow;
  action: (name: string) => CollectionFlow;
  // The application's own lanes join the same Flow, nested under the sync.
  participant: (name: string) => FlowLane;
};

const participant = (lane: Participant): FlowParticipant => ({
  name: lane.name,
  activated: (activationName) => lane.activated(activationName),
  activation: { start: lane.activation.start },
  event: lane.event,
  reply: lane.reply,
  send: lane.send,
  // Spans stay ordinary tracing; they only carry the lane so Lotel can name it.
  withSpan: (name, options) =>
    Effect.withSpan(name, {
      attributes: {
        ...options?.attributes,
        'flow.id': lane.flowId,
        'flow.participant.name': lane.name,
      },
    }),
});

export const makeSyncFlow = (placement: FlowPlacement): SyncFlow => {
  const { id, participantPrefix: root } = placement;
  const flow = Flow.make({ id });
  const get = (name: string) => participant(flow.participant(name));
  // One Outbox and one Drainer per Std Sync; collections and actions only
  // message them.
  const outbox = get(`${root}/outbox`);
  const drainer = get(`${root}/outbox/drainer`);
  const lanes = new Map<string, CollectionFlow>();
  const lane = (base: string): CollectionFlow => {
    const existing = lanes.get(base);
    if (existing) return existing;
    const collection = get(base);
    const collectionFlow: CollectionFlow = {
      id,
      collection,
      participant: (name) => get(`${base}/${name}`),
      outbox: { collection, outbox, drainer },
    };
    lanes.set(base, collectionFlow);
    return collectionFlow;
  };

  return {
    id,
    sync: get(root),
    outbox,
    drainer,
    participant: (name) => flow.participant(`${root}/${name}`),
    collection: (localName) => lane(`${root}/${localName}`),
    action: (name) => lane(`${root}/actions/${name}`),
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

// Cadence Repair is reported as a child of the Strategy Session it accompanies.
export const cadenceParticipantName = (strategyParticipantName: string) =>
  `${strategyParticipantName}/cadence-repair`;
