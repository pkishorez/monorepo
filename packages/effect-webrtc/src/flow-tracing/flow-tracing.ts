import {
  Activation,
  Flow,
  type ActivationOutcome,
  type ActivationRef,
  type FlowInstance,
  type MessageToken,
} from '@pkishorez/flow';
import { Effect, Schema } from 'effect';
import type { Scope } from 'effect/Scope';
import type {
  ConnectionAttemptId as ConnectionAttemptIdType,
  FlowCarrier,
  NegotiationEnvelope as NegotiationEnvelopeType,
  NegotiationMessage,
  PeerSessionId as PeerSessionIdType,
} from '../negotiation/index.js';
import {
  ConnectionAttemptId,
  FlowCarrierSchema,
  NegotiationEnvelope,
  PeerSessionId,
} from '../negotiation/index.js';
import type { PeerId } from '../peer-identity/index.js';

export const participantName = (peerId: PeerId) => `peer:${peerId}`;

export class FlowTracingError extends Schema.TaggedError<FlowTracingError>()(
  'FlowTracingError',
  {
    operation: Schema.Literals(['continue-connection', 'continue-rpc']),
    cause: Schema.Defect(),
  },
) {}

const commonFlowAttributes = (options: {
  readonly peerSessionId: PeerSessionIdType;
  readonly connectionAttemptId: ConnectionAttemptIdType;
  readonly remotePeerId: PeerId;
}) => ({
  peerSessionId: options.peerSessionId,
  connectionAttemptId: options.connectionAttemptId,
  remotePeerId: options.remotePeerId,
});

const endOnce = (
  activation: ActivationRef,
  baseAttributes: FlowNoteAttributes,
) => {
  let ended = false;
  return (outcome: ActivationOutcome, attributes?: FlowNoteAttributes) =>
    Effect.suspend(() => {
      if (ended) return Effect.void;
      ended = true;
      return activation.end(outcome, {
        attributes: { ...baseAttributes, ...attributes },
      });
    });
};

export type FlowNoteLevel = 'debug' | 'info' | 'warning' | 'error';
export type FlowNoteAttributes = Readonly<Record<string, unknown>>;

/** Splits one ICE candidate line into the fields worth reading in a Flow. */
const candidateAttributes = (candidate: string): FlowNoteAttributes => {
  const fields = candidate.replace(/^candidate:/, '').split(' ');
  const typeIndex = fields.indexOf('typ');
  return {
    candidate,
    candidateType: typeIndex === -1 ? null : (fields[typeIndex + 1] ?? null),
    protocol: fields[2] ?? null,
    address: fields[4] ?? null,
    port: fields[5] ?? null,
  };
};

const negotiationAttributes = (
  message: NegotiationMessage,
): FlowNoteAttributes | undefined =>
  message._tag === 'IceCandidate'
    ? candidateAttributes(message.candidate)
    : undefined;

const makeCarrier = (
  flowId: string,
  message: MessageToken,
  parentFlowId?: string,
): FlowCarrier => ({
  flowId,
  message,
  ...(parentFlowId === undefined ? {} : { parentFlowId }),
});

export interface ConnectionAttemptFlow {
  readonly peerSessionId: PeerSessionIdType;
  readonly connectionAttemptId: ConnectionAttemptIdType;
  readonly flow: FlowInstance;
  readonly send: (
    message: NegotiationMessage,
  ) => Effect.Effect<NegotiationEnvelopeType>;
  readonly reply: (
    incoming: NegotiationEnvelopeType,
    message: NegotiationMessage,
  ) => Effect.Effect<NegotiationEnvelopeType>;
  readonly connected: Effect.Effect<void>;
  readonly transientDisconnected: Effect.Effect<void>;
  /** Records one local diagnostic event in this Connection Attempt Flow. */
  readonly note: (
    message: string,
    options?: {
      readonly level?: FlowNoteLevel;
      readonly attributes?: FlowNoteAttributes;
    },
  ) => Effect.Effect<void>;
  readonly end: (
    outcome: ActivationOutcome,
    attributes?: FlowNoteAttributes,
  ) => Effect.Effect<void>;
}

const makeConnectionAttempt = Effect.fn('WebRtcFlow.makeConnectionAttempt')(
  function* (options: {
    readonly localPeerId: PeerId;
    readonly remotePeerId: PeerId;
    readonly peerSessionId: PeerSessionIdType;
    readonly connectionAttemptId: ConnectionAttemptIdType;
  }) {
    const flow = Flow.make({ id: options.connectionAttemptId });
    const participant = flow.participant(participantName(options.localPeerId));
    const attributes = {
      kind: 'webrtc.connection-attempt',
      ...commonFlowAttributes(options),
    };
    const activation = yield* participant.activation.start('RTC connection', {
      attributes,
    });
    const end = endOnce(activation, attributes);
    yield* Effect.addFinalizer(() =>
      end(Activation.interrupted('RTC connection scope closed')),
    );

    const envelope = (
      carrier: FlowCarrier,
      message: NegotiationMessage,
    ): NegotiationEnvelopeType =>
      NegotiationEnvelope.make({
        peerSessionId: options.peerSessionId,
        connectionAttemptId: options.connectionAttemptId,
        flow: carrier,
        message,
      });

    return {
      peerSessionId: options.peerSessionId,
      connectionAttemptId: options.connectionAttemptId,
      flow,
      send: (message) =>
        participant
          .send(participantName(options.remotePeerId), message._tag, {
            attributes: {
              ...attributes,
              ...negotiationAttributes(message),
            },
          })
          .pipe(
            Effect.map((token) =>
              envelope(makeCarrier(flow.id, token), message),
            ),
          ),
      reply: (incoming, message) =>
        participant
          .reply(incoming.flow.message, message._tag, {
            attributes: {
              ...attributes,
              ...negotiationAttributes(message),
            },
          })
          .pipe(
            Effect.map((token) =>
              envelope(makeCarrier(flow.id, token), message),
            ),
          ),
      connected: participant.event('RTC connected', {
        attributes,
        severity: 'debug',
      }),
      transientDisconnected: participant.event('RTC transiently disconnected', {
        attributes,
        severity: 'warning',
      }),
      note: (message, noteOptions) =>
        participant.event(message, {
          attributes: { ...attributes, ...noteOptions?.attributes },
          severity: noteOptions?.level ?? 'info',
        }),
      end,
    } satisfies ConnectionAttemptFlow;
  },
);

export const startConnectionAttempt = (options: {
  readonly localPeerId: PeerId;
  readonly remotePeerId: PeerId;
  readonly peerSessionId?: PeerSessionIdType;
}): Effect.Effect<ConnectionAttemptFlow, never, Scope> =>
  makeConnectionAttempt({
    ...options,
    peerSessionId:
      options.peerSessionId ??
      PeerSessionId.make(globalThis.crypto.randomUUID()),
    connectionAttemptId: ConnectionAttemptId.make(
      globalThis.crypto.randomUUID(),
    ),
  });

export const continueConnectionAttempt = (options: {
  readonly localPeerId: PeerId;
  readonly remotePeerId: PeerId;
  readonly incoming: NegotiationEnvelopeType;
}): Effect.Effect<ConnectionAttemptFlow, FlowTracingError, Scope> =>
  Effect.gen(function* () {
    const { incoming } = options;
    if (
      incoming.flow.flowId !== incoming.connectionAttemptId ||
      incoming.flow.message.from !== participantName(options.remotePeerId) ||
      incoming.flow.message.to !== participantName(options.localPeerId)
    ) {
      return yield* new FlowTracingError({
        operation: 'continue-connection',
        cause: 'Negotiation Flow carrier does not match its Peer envelope',
      });
    }
    return yield* makeConnectionAttempt({
      localPeerId: options.localPeerId,
      remotePeerId: options.remotePeerId,
      peerSessionId: incoming.peerSessionId,
      connectionAttemptId: incoming.connectionAttemptId,
    });
  });

export const rpcFlowHeaders = {
  carrier: 'effect-flow-carrier',
  peerSessionId: 'effect-peer-session-id',
} as const;

const decodeCarrier = (encoded: string) =>
  Effect.try({
    try: () => JSON.parse(encoded) as unknown,
    catch: (cause) =>
      new FlowTracingError({ operation: 'continue-rpc', cause }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(FlowCarrierSchema)),
    Effect.mapError(
      (cause) => new FlowTracingError({ operation: 'continue-rpc', cause }),
    ),
  );

export interface OutgoingRpcFlow {
  readonly flow: FlowInstance;
  readonly headers: ReadonlyArray<readonly [string, string]>;
  readonly end: (outcome: ActivationOutcome) => Effect.Effect<void>;
}

export const startRpcInvocation = Effect.fn('WebRtcFlow.startRpcInvocation')(
  function* (options: {
    readonly localPeerId: PeerId;
    readonly remotePeerId: PeerId;
    readonly peerSessionId: PeerSessionIdType;
    readonly connectionAttemptId: ConnectionAttemptIdType;
    readonly rpcTag: string;
  }): Effect.fn.Return<OutgoingRpcFlow> {
    const flow = Flow.make({ id: globalThis.crypto.randomUUID() });
    const participant = flow.participant(participantName(options.localPeerId));
    const attributes = {
      kind: 'webrtc.rpc-invocation',
      rpcTag: options.rpcTag,
      ...commonFlowAttributes(options),
    };
    const activation = yield* participant.activation.start(
      `RPC ${options.rpcTag}`,
      { attributes },
    );
    const end = endOnce(activation, attributes);
    const request = yield* participant.send(
      participantName(options.remotePeerId),
      `RPC ${options.rpcTag}`,
      { attributes },
    );
    return {
      flow,
      headers: [
        [
          rpcFlowHeaders.carrier,
          JSON.stringify(
            makeCarrier(flow.id, request, options.connectionAttemptId),
          ),
        ],
        [rpcFlowHeaders.peerSessionId, options.peerSessionId],
      ],
      end,
    } satisfies OutgoingRpcFlow;
  },
);

export interface IncomingRpcFlow {
  readonly flow: FlowInstance;
  readonly reply: (outcome: ActivationOutcome) => Effect.Effect<void>;
}

export const continueRpcInvocation = Effect.fn(
  'WebRtcFlow.continueRpcInvocation',
)(function* (options: {
  readonly localPeerId: PeerId;
  readonly remotePeerId: PeerId;
  readonly rpcTag: string;
  readonly headers: ReadonlyArray<readonly [string, string]>;
}): Effect.fn.Return<IncomingRpcFlow, FlowTracingError> {
  const headers = new Map(options.headers);
  const encodedCarrier = headers.get(rpcFlowHeaders.carrier);
  const encodedPeerSessionId = headers.get(rpcFlowHeaders.peerSessionId);
  if (encodedCarrier === undefined || encodedPeerSessionId === undefined) {
    return yield* new FlowTracingError({
      operation: 'continue-rpc',
      cause: 'RPC request is missing Flow headers',
    });
  }

  const carrier = yield* decodeCarrier(encodedCarrier);
  const peerSessionId = yield* Schema.decodeUnknownEffect(PeerSessionId)(
    encodedPeerSessionId,
  ).pipe(
    Effect.mapError(
      (cause) => new FlowTracingError({ operation: 'continue-rpc', cause }),
    ),
  );
  const connectionAttemptId = yield* Schema.decodeUnknownEffect(
    ConnectionAttemptId,
  )(carrier.parentFlowId).pipe(
    Effect.mapError(
      (cause) => new FlowTracingError({ operation: 'continue-rpc', cause }),
    ),
  );
  if (
    carrier.message.from !== participantName(options.remotePeerId) ||
    carrier.message.to !== participantName(options.localPeerId)
  ) {
    return yield* new FlowTracingError({
      operation: 'continue-rpc',
      cause: 'RPC Flow carrier does not match its Peer Session',
    });
  }

  const flow = Flow.make({ id: carrier.flowId });
  const participant = flow.participant(participantName(options.localPeerId));
  const attributes = {
    kind: 'webrtc.rpc-invocation',
    rpcTag: options.rpcTag,
    peerSessionId,
    connectionAttemptId,
    remotePeerId: options.remotePeerId,
  };
  const activation = yield* participant.activation.start(
    `Handle RPC ${options.rpcTag}`,
    { attributes },
  );
  const end = endOnce(activation, attributes);
  return {
    flow,
    reply: (outcome) =>
      participant
        .reply(carrier.message, `RPC ${outcome.kind}`, {
          attributes,
          severity: outcome.kind === 'failed' ? 'error' : 'info',
        })
        .pipe(Effect.andThen(end(outcome)), Effect.asVoid),
  } satisfies IncomingRpcFlow;
});

export { Activation };
