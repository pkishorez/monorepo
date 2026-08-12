import { initFlow } from '@pkishorez/effect-tracer/flow';
import type { Effect } from 'effect';
import type { PartitionValue } from '../../domain/partition-identity/index.js';

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
  ) => Effect.Effect<void>;
};

export type CollectionFlow = {
  readonly id: string;
  readonly collection: FlowParticipant;
  participant: (name: string) => FlowParticipant;
};

const participant = (id: string, name: string): FlowParticipant => {
  const flow = initFlow({ id, participantName: name });
  return {
    name,
    log: flow.log,
    withSpan: flow.withSpan,
    send: flow.send,
  };
};

export const makeCollectionFlow = (
  schemaName: string,
  lifecycleId: string,
): CollectionFlow => {
  const id = `std-collection::${schemaName}::${lifecycleId}`;
  const participants = new Map<string, FlowParticipant>();
  const getParticipant = (name: string) => {
    const existing = participants.get(name);
    if (existing) return existing;
    const created = participant(id, name);
    participants.set(name, created);
    return created;
  };
  const collection = getParticipant('collection');

  return {
    id,
    collection,
    participant: getParticipant,
  };
};

const partitionLabel = (partition: { field: string; value: PartitionValue }) =>
  `${partition.field}=${typeof partition.value}:${JSON.stringify(partition.value)}`;

export const globalParticipantName = (strategyName: string) =>
  `global-sync::${strategyName}`;

export const partitionParticipantName = (
  partition: { field: string; value: PartitionValue },
  strategyName: string,
) => `partition-sync::${partitionLabel(partition)}::${strategyName}`;

export const cadenceParticipantName = (partition?: {
  field: string;
  value: PartitionValue;
}) =>
  partition
    ? `cadence-repair::${partitionLabel(partition)}`
    : 'cadence-repair::global';

export const singleItemParticipantName = (strategyName: string) =>
  `single-item-sync::${strategyName}`;
