import { Effect } from 'effect';
import {
  flowAttributePrefix,
  flowAttributes,
  flowItemTypes,
  type TerminalFlowStatus,
} from './contract.js';
import { writeFlowLog, type FlowLogLevel } from './log.js';

interface FlowLogOptions {
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly flowAttributes?: Readonly<Record<string, unknown>>;
  readonly level?: FlowLogLevel;
}

interface FlowEndOptions {
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly flowAttributes?: Readonly<Record<string, unknown>>;
  readonly message?: unknown;
}

interface Flow<Participant extends string> {
  readonly id: string;
  readonly participantName: string;
  readonly withSpan: (
    name: string,
    options?: {
      readonly attributes?: Readonly<Record<string, unknown>>;
      readonly flowAttributes?: Readonly<Record<string, unknown>>;
    },
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  readonly log: (
    message: unknown,
    options?: FlowLogOptions,
  ) => Effect.Effect<void>;
  readonly send: (
    participantName: Participant,
    message: unknown,
    options?: FlowLogOptions,
  ) => Effect.Effect<void>;
  readonly end: (
    status: TerminalFlowStatus,
    options?: FlowEndOptions,
  ) => Effect.Effect<void>;
}

interface InitFlowOptions<
  Participants extends readonly string[] | undefined = undefined,
> {
  readonly id: string;
  readonly participantName: string;
  readonly participants?: Participants;
}

const validateOptions = (options: {
  readonly id: string;
  readonly participantName: string;
}) => {
  if (options.id.length === 0) throw new Error('Flow id cannot be empty.');
  if (options.participantName.length === 0) {
    throw new Error('Flow participantName cannot be empty.');
  }
};

const makeFlowAttributes = (id: string, participantName: string) => ({
  [flowAttributes.id]: id,
  [flowAttributes.participantName]: participantName,
});

const makeNamespacedFlowAttributes = (
  attributes: Readonly<Record<string, unknown>> | undefined,
) =>
  Object.fromEntries(
    Object.entries(attributes ?? {}).map(([key, value]) => [
      key.startsWith(flowAttributePrefix)
        ? key
        : `${flowAttributePrefix}${key}`,
      value,
    ]),
  );

/** Creates an application-propagated Flow bound to the local Participant. */
export const initFlow = <
  const Participants extends readonly string[] | undefined = undefined,
>(
  options: InitFlowOptions<Participants>,
): Flow<
  Participants extends readonly string[] ? Participants[number] : string
> => {
  validateOptions(options);
  const attributes = makeFlowAttributes(options.id, options.participantName);

  return {
    id: options.id,
    participantName: options.participantName,
    withSpan: (name, spanOptions) =>
      Effect.withSpan(name, {
        attributes: {
          ...spanOptions?.attributes,
          ...makeNamespacedFlowAttributes(spanOptions?.flowAttributes),
          ...attributes,
        },
      }),
    log: (message, logOptions) =>
      writeFlowLog(logOptions?.level ?? 'info', message, {
        ...logOptions?.attributes,
        ...makeNamespacedFlowAttributes(logOptions?.flowAttributes),
        ...attributes,
        [flowAttributes.itemType]: flowItemTypes.localEvent,
      }),
    send: (participantName, message, logOptions) =>
      writeFlowLog(logOptions?.level ?? 'info', message, {
        ...logOptions?.attributes,
        ...makeNamespacedFlowAttributes(logOptions?.flowAttributes),
        ...attributes,
        [flowAttributes.itemType]: flowItemTypes.message,
        [flowAttributes.messageTo]: participantName,
      }),
    end: (status, endOptions) =>
      writeFlowLog('info', endOptions?.message ?? `Flow ${status}`, {
        ...endOptions?.attributes,
        ...makeNamespacedFlowAttributes(endOptions?.flowAttributes),
        ...attributes,
        [flowAttributes.itemType]: flowItemTypes.localEvent,
        [flowAttributes.status]: status,
      }),
  };
};

export {
  flowAttributePrefix,
  flowAttributes,
  flowItemTypes,
  flowStatuses,
  isTerminalFlowStatus,
  terminalFlowStatuses,
} from './contract.js';
export type {
  FlowActivityStatus,
  FlowStatus,
  RecordedFlow,
  RecordedFlowActivity,
  RecordedFlowActivityLog,
  RecordedFlowItem,
  RecordedFlowLocalEvent,
  RecordedFlowMessage,
  RecordedFlowSeverity,
  RecordedFlowStatus,
  RecordedFlowWarning,
  TerminalFlowStatus,
} from './contract.js';
