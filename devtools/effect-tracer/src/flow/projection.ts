import { flowItemTypes, isActivationOutcomeKind } from './contract.js';
import { deriveRecordedFlow } from './derive.js';
import type {
  FlowEventObservation,
  FlowObservation,
  ProjectFlowInput,
} from './observation.js';
import type {
  RecordedFlow,
  RecordedFlowItem,
  RecordedFlowWarning,
} from './schema.js';

type ProjectionResult =
  | { readonly item: RecordedFlowItem }
  | { readonly warning: RecordedFlowWarning };

const missingParticipant = (
  observation: FlowObservation,
): RecordedFlowWarning => ({
  recordType: observation.source,
  recordId: observation.recordId,
  message:
    observation.source === 'span'
      ? 'Flow Span is missing flow.participant.name.'
      : 'Flow Log Record is missing flow.participant.name.',
});

const projectEvent = (
  observation: FlowEventObservation & { readonly participantName: string },
): ProjectionResult => {
  const common = {
    id: observation.recordId,
    participantName: observation.participantName,
    name: observation.name,
    timestamp: observation.timestamp,
    severity: observation.severity,
    ...(observation.attributes ? { attributes: observation.attributes } : {}),
  };

  switch (observation.itemType) {
    case flowItemTypes.activationStart:
      return { item: { kind: 'activation-start', ...common } };
    case flowItemTypes.activationEnd:
      if (!isActivationOutcomeKind(observation.activationOutcome)) {
        return {
          warning: {
            recordType: 'log',
            recordId: observation.recordId,
            message: 'Activation End is missing flow.activation.outcome.',
          },
        };
      }
      return {
        item: {
          kind: 'activation-end',
          outcome: observation.activationOutcome,
          ...common,
        },
      };
    case flowItemTypes.state:
      return {
        item: {
          kind: 'state',
          state: observation.state ?? {},
          merged: {},
          ...common,
        },
      };
    case flowItemTypes.message:
      if (!observation.destination) {
        return {
          warning: {
            recordType: 'log',
            recordId: observation.recordId,
            message: 'Flow Message is missing flow.message.to.',
          },
        };
      }
      return {
        item: {
          kind: 'message',
          destination: observation.destination,
          messageId: observation.messageId ?? observation.recordId,
          ...(observation.replyTo ? { replyTo: observation.replyTo } : {}),
          ...common,
        },
      };
    default:
      return { item: { kind: 'local-event', ...common } };
  }
};

const projectObservation = (observation: FlowObservation): ProjectionResult => {
  if (!observation.participantName) {
    return { warning: missingParticipant(observation) };
  }
  if (observation.source === 'log') {
    return projectEvent({
      ...observation,
      participantName: observation.participantName,
    });
  }
  return {
    item: {
      kind: 'activity',
      id: observation.recordId,
      participantName: observation.participantName,
      name: observation.name,
      timestamp: observation.timestamp,
      duration: observation.duration,
      status: observation.status,
      traceId: observation.traceId,
      spanId: observation.spanId,
      ...(observation.attributes ? { attributes: observation.attributes } : {}),
      ...(observation.logs ? { logs: observation.logs } : {}),
    },
  };
};

export const projectObservations = (input: ProjectFlowInput): RecordedFlow => {
  const projected = input.observations
    .map((observation) => ({
      result: projectObservation(observation),
      timestamp: observation.timestamp,
      order: observation.order,
    }))
    .sort(
      (left, right) =>
        left.timestamp - right.timestamp ||
        left.order.localeCompare(right.order),
    );
  const items: RecordedFlowItem[] = [];
  const warnings: RecordedFlowWarning[] = [];
  for (const { result } of projected) {
    if ('item' in result) items.push(result.item);
    else warnings.push(result.warning);
  }
  const derived = deriveRecordedFlow(items);
  return {
    id: input.id,
    latestTimestamp: input.latestTimestamp,
    items: derived.items,
    activations: derived.activations,
    warnings: [...warnings, ...derived.warnings],
  };
};
