import {
  initFlow,
  type ActivationRef,
  type MessageToken,
  type RecordedFlowAttributeValue,
} from '@pkishorez/effect-tracer/flow';
import type { Effect } from 'effect';
import type { PartitionValue } from '../../domain/partition-identity/index.js';

export type ActivationOutcome = Parameters<ActivationRef['end']>[0];

type FlowLogOptions = {
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly level?: 'debug' | 'error' | 'info' | 'warning';
};

export type StrategyFlow = {
  log: (message: unknown, options?: FlowLogOptions) => Effect.Effect<void>;
  /** Publishes part of this participant's state; keys merge forward. */
  state: (
    patch: Readonly<Record<string, RecordedFlowAttributeValue>>,
  ) => Effect.Effect<void>;
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
  /** Opens this participant's Activation; the ref is the only way to close it. */
  activation: {
    start: (name?: unknown) => Effect.Effect<ActivationRef>;
  };
  /** Runs the effect inside one Activation whose outcome follows its Exit. */
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
    state: flow.state,
    withSpan: flow.withSpan,
  };
};

export const makeCollectionFlow = (
  schemaName: string,
  lifecycleId: string,
  placement?: FlowPlacement,
): CollectionFlow => {
  const id = placement?.id ?? `std-collection::${schemaName}::${lifecycleId}`;
  const collectionName = placement
    ? `${placement.participantPrefix}/collection:${schemaName}`
    : 'collection';
  const qualify = (name: string) =>
    placement && name !== 'collection'
      ? `${collectionName}/${name}`
      : name === 'collection'
        ? collectionName
        : name;
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
