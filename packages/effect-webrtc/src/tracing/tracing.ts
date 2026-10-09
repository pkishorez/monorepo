import { Clock, Effect, Exit, Tracer } from 'effect';
import type { Scope } from 'effect/Scope';
import type {
  ConnectionAttemptId as ConnectionAttemptIdType,
  NegotiationEnvelope as NegotiationEnvelopeType,
  NegotiationMessage,
  PeerSessionId as PeerSessionIdType,
  TraceCarrier,
} from '../negotiation/index.js';
import {
  ConnectionAttemptId,
  NegotiationEnvelope,
  PeerSessionId,
} from '../negotiation/index.js';
import type { PeerId } from '../peer-identity/index.js';

type Attributes = Readonly<Record<string, unknown>>;

interface PeerSpanContext {
  readonly localPeerId: PeerId;
  readonly remotePeerId: PeerId;
  readonly peerSessionId: PeerSessionIdType;
  readonly connectionAttemptId: ConnectionAttemptIdType;
}

/** Identifies the two Peers and the session behind a span. */
const peerAttributes = (context: PeerSpanContext) => ({
  'webrtc.peer.local_id': context.localPeerId,
  'webrtc.peer.remote_id': context.remotePeerId,
  'webrtc.peer_session.id': context.peerSessionId,
  'webrtc.connection_attempt.id': context.connectionAttemptId,
});

/** How a Connection Attempt ended. */
export type AttemptOutcome =
  | { readonly _tag: 'Completed' }
  | { readonly _tag: 'Failed'; readonly reason: string }
  | { readonly _tag: 'Interrupted'; readonly reason: string };

export const AttemptOutcome = {
  completed: (): AttemptOutcome => ({ _tag: 'Completed' }),
  failed: (reason: string): AttemptOutcome => ({ _tag: 'Failed', reason }),
  interrupted: (reason: string): AttemptOutcome => ({
    _tag: 'Interrupted',
    reason,
  }),
};

const exitOf = (outcome: AttemptOutcome): Exit.Exit<unknown, unknown> => {
  switch (outcome._tag) {
    case 'Completed':
      return Exit.void;
    case 'Failed':
      return Exit.fail(outcome.reason);
    case 'Interrupted':
      return Exit.interrupt();
  }
};

export type NoteLevel = 'debug' | 'info' | 'warning' | 'error';

/** Splits one ICE candidate line into the fields worth reading in a trace. */
const candidateAttributes = (candidate: string): Attributes => {
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

export interface ConnectionAttempt {
  readonly peerSessionId: PeerSessionIdType;
  readonly connectionAttemptId: ConnectionAttemptIdType;
  /** Records the message on the attempt span and wraps it for Signaling. */
  readonly send: (
    message: NegotiationMessage,
  ) => Effect.Effect<NegotiationEnvelopeType>;
  readonly connected: Effect.Effect<void>;
  readonly transientDisconnected: Effect.Effect<void>;
  /** Records one local diagnostic event on the attempt span. */
  readonly note: (
    message: string,
    options?: {
      readonly level?: NoteLevel;
      readonly attributes?: Attributes;
    },
  ) => Effect.Effect<void>;
  /** Ends the attempt span once, adding any final attributes; later calls do nothing. */
  readonly end: (
    outcome: AttemptOutcome,
    attributes?: Attributes,
  ) => Effect.Effect<void>;
}

const connectionAttemptSpanName = 'WebRtc.connectionAttempt';

const makeConnectionAttempt = (
  options: PeerSpanContext & {
    readonly role: 'offerer' | 'answerer';
    readonly parent?: TraceCarrier;
  },
): Effect.Effect<ConnectionAttempt, never, Scope> =>
  Effect.gen(function* () {
    const span = yield* Effect.makeSpan(connectionAttemptSpanName, {
      attributes: {
        ...peerAttributes(options),
        'webrtc.negotiation.role': options.role,
      },
      ...(options.parent === undefined
        ? { root: true }
        : { parent: Tracer.externalSpan(options.parent) }),
    });
    const carrier: TraceCarrier = {
      traceId: span.traceId,
      spanId: span.spanId,
    };

    const event = (name: string, attributes?: Attributes) =>
      Effect.map(Clock.currentTimeNanos, (now) =>
        span.event(name, now, attributes),
      );

    let ended = false;
    const end = (outcome: AttemptOutcome, attributes?: Attributes) =>
      Effect.suspend(() => {
        if (ended) return Effect.void;
        ended = true;
        return Effect.map(Clock.currentTimeNanos, (now) => {
          span.attribute(
            'webrtc.connection_attempt.outcome',
            outcome._tag.toLowerCase(),
          );
          if (outcome._tag !== 'Completed') {
            span.attribute(
              'webrtc.connection_attempt.outcome_reason',
              outcome.reason,
            );
          }
          for (const [key, value] of Object.entries(attributes ?? {})) {
            span.attribute(key, value);
          }
          span.end(now, exitOf(outcome));
        });
      });
    yield* Effect.addFinalizer(() =>
      end(AttemptOutcome.interrupted('RTC connection scope closed')),
    );

    return {
      peerSessionId: options.peerSessionId,
      connectionAttemptId: options.connectionAttemptId,
      send: (message) =>
        event(`${message._tag} sent`, {
          'webrtc.negotiation.message': message._tag,
          ...(message._tag === 'IceCandidate'
            ? candidateAttributes(message.candidate)
            : undefined),
        }).pipe(
          Effect.as(
            NegotiationEnvelope.make({
              peerSessionId: options.peerSessionId,
              connectionAttemptId: options.connectionAttemptId,
              trace: carrier,
              message,
            }),
          ),
        ),
      connected: event('RTC connected', { level: 'debug' }),
      transientDisconnected: event('RTC transiently disconnected', {
        level: 'warning',
      }),
      note: (message, noteOptions) =>
        event(message, {
          ...noteOptions?.attributes,
          level: noteOptions?.level ?? 'info',
        }),
      end,
    } satisfies ConnectionAttempt;
  });

/** Starts the offerer's Connection Attempt as the root span of a new trace. */
export const startConnectionAttempt = (options: {
  readonly localPeerId: PeerId;
  readonly remotePeerId: PeerId;
  readonly peerSessionId?: PeerSessionIdType;
}): Effect.Effect<ConnectionAttempt, never, Scope> =>
  makeConnectionAttempt({
    ...options,
    role: 'offerer',
    peerSessionId:
      options.peerSessionId ??
      PeerSessionId.make(globalThis.crypto.randomUUID()),
    connectionAttemptId: ConnectionAttemptId.make(
      globalThis.crypto.randomUUID(),
    ),
  });

/** Continues the offerer's trace with the answerer's own attempt span. */
export const continueConnectionAttempt = (options: {
  readonly localPeerId: PeerId;
  readonly remotePeerId: PeerId;
  readonly incoming: NegotiationEnvelopeType;
}): Effect.Effect<ConnectionAttempt, never, Scope> =>
  makeConnectionAttempt({
    localPeerId: options.localPeerId,
    remotePeerId: options.remotePeerId,
    peerSessionId: options.incoming.peerSessionId,
    connectionAttemptId: options.incoming.connectionAttemptId,
    role: 'answerer',
    parent: options.incoming.trace,
  });

/**
 * Names and labels the spans `effect/rpc` opens for each RPC invocation, so a
 * trace shows which Peers and Connection Attempt carried it.
 */
export const rpcSpanOptions = (
  context: PeerSpanContext,
  side: 'client' | 'server',
) => ({
  spanPrefix: side === 'client' ? 'WebRtc.RpcClient' : 'WebRtc.RpcServer',
  spanAttributes: peerAttributes(context),
});
