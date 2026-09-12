import {
  Activation,
  FlowCarrierSchema,
  initFlow,
} from '@pkishorez/effect-tracer/flow';
import { Effect, Schema } from 'effect';
import type { Scope } from 'effect/Scope';
import type {
  ConnectionAttemptId as ConnectionAttemptIdType,
  NegotiationEnvelope as NegotiationEnvelopeType,
  NegotiationMessage,
  PeerSessionId as PeerSessionIdType,
} from '../negotiation/index.js';
import {
  ConnectionAttemptId,
  NegotiationEnvelope,
  PeerSessionId,
} from '../negotiation/index.js';
import type { PeerId } from '../peer-identity/index.js';

type Flow = ReturnType<typeof initFlow>;
type ActivationRef = Effect.Success<ReturnType<Flow['activation']['start']>>;
type ActivationOutcome = Parameters<ActivationRef['end']>[0];
type FlowCarrier = typeof FlowCarrierSchema.Type;

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

const endOnce = (activation: ActivationRef) => {
  let ended = false;
  return (outcome: ActivationOutcome) =>
    Effect.suspend(() => {
      if (ended) return Effect.void;
      ended = true;
      return activation.end(outcome);
    });
};

export interface ConnectionAttemptFlow {
  readonly peerSessionId: PeerSessionIdType;
  readonly connectionAttemptId: ConnectionAttemptIdType;
  readonly flow: Flow;
  readonly send: (
    message: NegotiationMessage,
  ) => Effect.Effect<NegotiationEnvelopeType>;
  readonly reply: (
    incoming: NegotiationEnvelopeType,
    message: NegotiationMessage,
  ) => Effect.Effect<NegotiationEnvelopeType>;
  readonly observe: (incoming: NegotiationEnvelopeType) => void;
  readonly connected: Effect.Effect<void>;
  readonly transientDisconnected: Effect.Effect<void>;
  readonly end: (outcome: ActivationOutcome) => Effect.Effect<void>;
}

const makeConnectionAttempt = Effect.fn('WebRtcFlow.makeConnectionAttempt')(
  function* (options: {
    readonly localPeerId: PeerId;
    readonly remotePeerId: PeerId;
    readonly peerSessionId: PeerSessionIdType;
    readonly connectionAttemptId: ConnectionAttemptIdType;
    readonly carrier?: FlowCarrier;
  }) {
    const flow = initFlow({
      id: options.connectionAttemptId,
      participantName: participantName(options.localPeerId),
      ...(options.carrier === undefined
        ? {}
        : { initialOrder: options.carrier.message.order }),
      flowAttributes: {
        kind: 'webrtc.connection-attempt',
        ...commonFlowAttributes(options),
      },
    });
    const activation = yield* flow.activation.start('RTC connection');
    const end = endOnce(activation);
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
        flow
          .send(participantName(options.remotePeerId), message._tag)
          .pipe(Effect.map((token) => envelope(flow.carrier(token), message))),
      reply: (incoming, message) =>
        flow
          .reply(incoming.flow.message, message._tag)
          .pipe(Effect.map((token) => envelope(flow.carrier(token), message))),
      observe: (incoming) => flow.observe(incoming.flow.message),
      connected: flow.log('RTC connected', { level: 'debug' }),
      transientDisconnected: flow.log('RTC transiently disconnected', {
        level: 'warning',
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
      carrier: incoming.flow,
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
  readonly flow: Flow;
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
    const flow = initFlow({
      id: globalThis.crypto.randomUUID(),
      parentId: options.connectionAttemptId,
      participantName: participantName(options.localPeerId),
      flowAttributes: {
        kind: 'webrtc.rpc-invocation',
        rpcTag: options.rpcTag,
        ...commonFlowAttributes(options),
      },
    });
    const activation = yield* flow.activation.start(`RPC ${options.rpcTag}`);
    const end = endOnce(activation);
    const request = yield* flow.send(
      participantName(options.remotePeerId),
      `RPC ${options.rpcTag}`,
      { level: 'info' },
    );
    return {
      flow,
      headers: [
        [rpcFlowHeaders.carrier, JSON.stringify(flow.carrier(request))],
        [rpcFlowHeaders.peerSessionId, options.peerSessionId],
      ],
      end,
    } satisfies OutgoingRpcFlow;
  },
);

export interface IncomingRpcFlow {
  readonly flow: Flow;
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

  const flow = initFlow({
    id: carrier.flowId,
    parentId: connectionAttemptId,
    initialOrder: carrier.message.order,
    participantName: participantName(options.localPeerId),
    flowAttributes: {
      kind: 'webrtc.rpc-invocation',
      rpcTag: options.rpcTag,
      peerSessionId,
      connectionAttemptId,
      remotePeerId: options.remotePeerId,
    },
  });
  const activation = yield* flow.activation.start(
    `Handle RPC ${options.rpcTag}`,
  );
  const end = endOnce(activation);
  return {
    flow,
    reply: (outcome) =>
      flow
        .reply(carrier.message, `RPC ${outcome.kind}`, {
          level: outcome.kind === 'failed' ? 'error' : 'info',
        })
        .pipe(Effect.andThen(end(outcome)), Effect.asVoid),
  } satisfies IncomingRpcFlow;
});

export { Activation };
