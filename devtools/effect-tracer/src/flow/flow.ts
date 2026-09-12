import { Cause, Effect, Exit } from 'effect';
import {
  flowAttributePrefix,
  flowAttributes,
  flowItemTypes,
  type ActivationOutcome,
} from './contract.js';
import { deriveRecordedFlow } from './derive.js';
import { writeFlowLog, type FlowLogLevel } from './log.js';
import { mergeRelatedFlowRecords } from './merge-related-flows.js';
import type { ProjectFlowInput } from './observation.js';
import { projectObservations } from './projection.js';
import type { FlowCarrier, MessageToken, RecordedFlowItem } from './schema.js';

interface FlowLogOptions {
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly flowAttributes?: Readonly<Record<string, unknown>>;
  readonly level?: FlowLogLevel;
}

interface ActivationOptions extends FlowLogOptions {
  readonly name?: unknown;
}

/** A started Activation. Ending it is the only thing you can do with it. */
export interface ActivationRef {
  readonly end: (
    outcome: ActivationOutcome,
    options?: FlowLogOptions,
  ) => Effect.Effect<void>;
}

interface Flow {
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
    participantName: string,
    message: unknown,
    options?: FlowLogOptions,
  ) => Effect.Effect<MessageToken>;
  readonly reply: (
    token: MessageToken,
    message: unknown,
    options?: FlowLogOptions,
  ) => Effect.Effect<MessageToken>;
  /** Advances this Participant's causal clock after receiving a Message. */
  readonly observe: (token: MessageToken) => void;
  readonly carrier: (token: MessageToken) => FlowCarrier;
  readonly activation: {
    readonly start: (
      name?: unknown,
      options?: FlowLogOptions,
    ) => Effect.Effect<ActivationRef>;
  };
  readonly activated: (
    options?: ActivationOptions,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
}

interface InitFlowOptions {
  readonly flowAttributes?: Readonly<Record<string, unknown>>;
  readonly id: string;
  readonly initialOrder?: number;
  readonly parentId?: string;
  readonly participantName: string;
}

const validateOptions = (options: InitFlowOptions) => {
  if (options.id.length === 0) throw new Error('Flow id cannot be empty.');
  if (options.participantName.length === 0) {
    throw new Error('Flow participantName cannot be empty.');
  }
};

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

const nextMessageId = () => globalThis.crypto.randomUUID();

const outcomeOfExit = (
  exit: Exit.Exit<unknown, unknown>,
): ActivationOutcome => {
  if (Exit.isSuccess(exit)) return { kind: 'completed' };
  if (Cause.hasInterruptsOnly(exit.cause)) return { kind: 'interrupted' };
  return { kind: 'failed', error: Cause.squash(exit.cause) };
};

const outcomeAttributes = (outcome: ActivationOutcome) => ({
  [flowAttributes.activationOutcome]: outcome.kind,
  ...(outcome.kind === 'failed'
    ? makeNamespacedFlowAttributes({ error: String(outcome.error) })
    : {}),
  ...(outcome.kind === 'interrupted' && outcome.reason !== undefined
    ? makeNamespacedFlowAttributes({ reason: outcome.reason })
    : {}),
});

/** Creates an application-propagated Flow bound to the local Participant. */
export const initFlow = (options: InitFlowOptions): Flow => {
  validateOptions(options);
  let order = options.initialOrder ?? 0;
  const nextOrder = () => (order += 1);
  const observe = (token: MessageToken) => {
    order = Math.max(order, token.order);
  };
  const attributes = {
    ...makeNamespacedFlowAttributes(options.flowAttributes),
    [flowAttributes.id]: options.id,
    ...(options.parentId === undefined
      ? {}
      : { [flowAttributes.parentId]: options.parentId }),
    [flowAttributes.participantName]: options.participantName,
  };

  const write = (
    level: FlowLogLevel | undefined,
    message: unknown,
    logOptions: FlowLogOptions | undefined,
    own: Readonly<Record<string, unknown>>,
  ) =>
    Effect.suspend(() =>
      writeFlowLog(logOptions?.level ?? level ?? 'info', message, {
        ...logOptions?.attributes,
        ...makeNamespacedFlowAttributes(logOptions?.flowAttributes),
        ...attributes,
        [flowAttributes.order]: nextOrder(),
        ...own,
      }),
    );

  const endActivation = (
    outcome: ActivationOutcome,
    endOptions?: FlowLogOptions,
  ) =>
    write(
      outcome.kind === 'failed' ? 'error' : 'info',
      `Activation ${outcome.kind}`,
      endOptions,
      {
        [flowAttributes.itemType]: flowItemTypes.activationEnd,
        ...outcomeAttributes(outcome),
      },
    );

  const startActivation = (name?: unknown, startOptions?: FlowLogOptions) =>
    write(undefined, name ?? 'Activation', startOptions, {
      [flowAttributes.itemType]: flowItemTypes.activationStart,
    }).pipe(Effect.as<ActivationRef>({ end: endActivation }));

  return {
    id: options.id,
    participantName: options.participantName,
    withSpan: (name, spanOptions) => (effect) =>
      Effect.suspend(() =>
        effect.pipe(
          Effect.withSpan(name, {
            attributes: {
              ...spanOptions?.attributes,
              ...makeNamespacedFlowAttributes(spanOptions?.flowAttributes),
              ...attributes,
              [flowAttributes.order]: nextOrder(),
            },
          }),
        ),
      ),
    log: (message, logOptions) =>
      write(undefined, message, logOptions, {
        [flowAttributes.itemType]: flowItemTypes.localEvent,
      }),
    send: (participantName, message, logOptions) =>
      Effect.suspend(() => {
        const id = nextMessageId();
        const messageOrder = order + 1;
        return write(undefined, message, logOptions, {
          [flowAttributes.itemType]: flowItemTypes.message,
          [flowAttributes.messageId]: id,
          [flowAttributes.messageTo]: participantName,
        }).pipe(
          Effect.as<MessageToken>({
            from: options.participantName,
            id,
            order: messageOrder,
            to: participantName,
          }),
        );
      }),
    reply: (token, message, logOptions) =>
      Effect.suspend(() => {
        observe(token);
        const id = nextMessageId();
        const messageOrder = order + 1;
        return write(undefined, message, logOptions, {
          [flowAttributes.itemType]: flowItemTypes.message,
          [flowAttributes.messageId]: id,
          [flowAttributes.messageReplyTo]: token.id,
          [flowAttributes.messageTo]: token.from,
        }).pipe(
          Effect.as<MessageToken>({
            from: options.participantName,
            id,
            order: messageOrder,
            to: token.from,
          }),
        );
      }),
    observe,
    carrier: (token) => ({
      flowId: options.id,
      message: token,
      ...(options.parentId === undefined
        ? {}
        : { parentFlowId: options.parentId }),
    }),
    activation: { start: startActivation },
    activated: (activationOptions) => (effect) =>
      Effect.uninterruptibleMask((restore) =>
        startActivation(activationOptions?.name, activationOptions).pipe(
          Effect.flatMap((activation) =>
            restore(effect).pipe(
              Effect.onExit((exit) => activation.end(outcomeOfExit(exit))),
            ),
          ),
        ),
      ),
  };
};

/** Builds one Recorded Flow from source-independent span and log observations. */
export const projectFlow = (input: ProjectFlowInput) =>
  projectObservations(input);

/** Derives Activations and whole-Flow warnings. */
export const deriveFlow = (items: readonly RecordedFlowItem[]) =>
  deriveRecordedFlow(items);

/** Combines each parent Flow and its descendants into one presentation Flow. */
export const mergeRelatedFlows = mergeRelatedFlowRecords;

export {
  Activation,
  activationOutcomeKinds,
  flowAttributePrefix,
  flowAttributes,
  flowItemTypes,
  isActivationOutcomeKind,
} from './contract.js';
export type {
  ActivationOutcome,
  ActivationOutcomeKind,
  FlowRecordAttributes,
} from './contract.js';
export type { FlowObservation, ProjectFlowInput } from './observation.js';
export {
  ActivationOutcomeKindSchema,
  FlowActivityStatusSchema,
  FlowCarrierSchema,
  FlowMessageTokenSchema,
  RecordedFlowActivationEndSchema,
  RecordedFlowActivationSchema,
  RecordedFlowActivationStartSchema,
  RecordedFlowActivityLogSchema,
  RecordedFlowActivitySchema,
  RecordedFlowAttributeValueSchema,
  RecordedFlowItemSchema,
  RecordedFlowLocalEventSchema,
  RecordedFlowMessageSchema,
  RecordedFlowSchema,
  RecordedFlowSeveritySchema,
  RecordedFlowWarningSchema,
  type FlowActivityStatus,
  type FlowCarrier,
  type MessageToken,
  type RecordedFlow,
  type RecordedFlowActivation,
  type RecordedFlowActivationEnd,
  type RecordedFlowActivationStart,
  type RecordedFlowActivity,
  type RecordedFlowActivityLog,
  type RecordedFlowAttributeValue,
  type RecordedFlowItem,
  type RecordedFlowLocalEvent,
  type RecordedFlowMessage,
  type RecordedFlowSeverity,
  type RecordedFlowWarning,
} from './schema.js';
