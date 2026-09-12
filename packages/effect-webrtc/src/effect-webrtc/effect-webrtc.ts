import { Activation } from '@pkishorez/effect-tracer/flow';
import {
  Deferred,
  Effect,
  Layer,
  Option,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Scope } from 'effect/Scope';
import type { Rpc, RpcClient, RpcGroup } from 'effect/unstable/rpc';
import {
  continueConnectionAttempt,
  startConnectionAttempt,
} from '../flow-tracing/index.js';
import type {
  NegotiationEnvelope,
  PeerSessionId,
} from '../negotiation/index.js';
import { NegotiationMessage } from '../negotiation/index.js';
import type {
  RtcConnection,
  RtcConnectionState,
  RtcDataChannel,
} from '../platform/platform.js';
import { WebRtcPlatform } from '../platform/platform.js';
import { PeerId as PeerIdSchema } from '../peer-identity/index.js';
import type { PeerId as PeerIdType } from '../peer-identity/index.js';
import { make as makeRpcTransport } from '../rpc/index.js';
import { Signaling } from '../signaling/signaling.js';

type ConnectionAttemptFlow = Effect.Success<
  ReturnType<typeof startConnectionAttempt>
>;

/** Canonical constructor and Schema for Peer Identifiers. */
export const PeerId = PeerIdSchema;
export type PeerId = PeerIdType;

export type SessionStatus =
  | { readonly _tag: 'Connecting' }
  | { readonly _tag: 'Connected' }
  | {
      readonly _tag: 'Disconnected';
      readonly rtcState: RtcConnectionState;
    };

export class WebRtcError extends Error {
  readonly _tag = 'WebRtcError';
  constructor(
    readonly operation: 'make' | 'connect' | 'disconnect',
    readonly cause: unknown,
  ) {
    super(`WebRTC ${operation} failed`);
  }
}

export interface PeerSession {
  readonly remoteId: PeerIdType;
  readonly status: Stream.Stream<SessionStatus>;
}

export interface RemotePeer<Remote extends Rpc.Any> extends PeerSession {
  readonly rpc: RpcClient.RpcClient<Remote>;
}

export interface Connect {
  <Remote extends Rpc.Any>(options: {
    readonly id: PeerIdType;
    readonly consumes: RpcGroup.RpcGroup<Remote>;
  }): Effect.Effect<RemotePeer<Remote>, WebRtcError>;

  (options: {
    readonly id: PeerIdType;
  }): Effect.Effect<PeerSession, WebRtcError>;
}

export interface Peer {
  readonly id: PeerIdType;
  readonly connect: Connect;
  readonly sessions: Stream.Stream<ReadonlyArray<PeerSession>>;
  readonly disconnect: (
    remoteId: PeerIdType,
  ) => Effect.Effect<void, WebRtcError>;
}

interface BaseMakeOptions {
  readonly id: PeerIdType;
}

interface ProviderMakeOptions<
  Local extends Rpc.Any,
  E,
  R,
> extends BaseMakeOptions {
  readonly provides: {
    readonly group: RpcGroup.RpcGroup<Local>;
    readonly handlers: Layer.Layer<Rpc.ToHandler<Local>, E, R>;
  };
}

export interface Make {
  <Local extends Rpc.Any, E, R>(
    options: ProviderMakeOptions<Local, E, R>,
  ): Effect.Effect<
    Peer,
    WebRtcError | E,
    | Signaling
    | WebRtcPlatform
    | Scope
    | R
    | Rpc.Middleware<Local>
    | Rpc.ServicesServer<Local>
  >;

  (
    options: BaseMakeOptions,
  ): Effect.Effect<Peer, WebRtcError, Signaling | WebRtcPlatform | Scope>;
}

interface Provider {
  readonly group: RpcGroup.RpcGroup<Rpc.Any>;
  readonly handlers: Layer.Layer<Rpc.ToHandler<Rpc.Any>>;
}

interface InternalSession {
  readonly remoteId: PeerIdType;
  readonly statusRef: SubscriptionRef.SubscriptionRef<SessionStatus>;
  readonly publicSession: PeerSession;
  readonly ready: Deferred.Deferred<PeerSession, WebRtcError>;
  intent: boolean;
  peerSessionId?: PeerSessionId;
  consumes?: RpcGroup.RpcGroup<Rpc.Any>;
  connection?: RtcConnection;
  attempt?: ConnectionAttemptFlow;
  boundSession: PeerSession | undefined;
  connected: boolean;
  connecting: boolean;
}

const asWebRtcError =
  (operation: WebRtcError['operation']) => (cause: unknown) =>
    new WebRtcError(operation, cause);

const makeInternal: (
  options: BaseMakeOptions | ProviderMakeOptions<Rpc.Any, unknown, unknown>,
) => Effect.Effect<Peer, WebRtcError, Signaling | WebRtcPlatform | Scope> =
  Effect.fn('WebRtc.make')(function* (options) {
    const signalingService = yield* Signaling;
    const platform = yield* WebRtcPlatform;
    const signaling = yield* signalingService
      .open(options.id)
      .pipe(Effect.mapError(asWebRtcError('make')));
    const provider =
      'provides' in options ? (options.provides as Provider) : undefined;
    const records = new Map<PeerIdType, InternalSession>();
    const sessionsRef = yield* SubscriptionRef.make<ReadonlyArray<PeerSession>>(
      [],
    );

    const recordFor = Effect.fn('WebRtc.recordFor')(function* (
      remoteId: PeerIdType,
    ) {
      const existing = records.get(remoteId);
      if (existing !== undefined) return existing;
      const statusRef = yield* SubscriptionRef.make<SessionStatus>({
        _tag: 'Connecting',
      });
      const publicSession: PeerSession = {
        remoteId,
        status: SubscriptionRef.changes(statusRef),
      };
      const ready = yield* Deferred.make<PeerSession, WebRtcError>();
      const created: InternalSession = {
        remoteId,
        statusRef,
        publicSession,
        ready,
        intent: false,
        boundSession: undefined,
        connected: false,
        connecting: false,
      };
      records.set(remoteId, created);
      yield* SubscriptionRef.update(sessionsRef, (sessions) => [
        ...sessions,
        publicSession,
      ]);
      return created;
    });

    const send = (record: InternalSession, envelope: NegotiationEnvelope) =>
      signaling.send(record.remoteId, envelope);

    const sendIce = Effect.fn('WebRtc.sendIce')(function* (
      record: InternalSession,
      connection: RtcConnection,
      attempt: ConnectionAttemptFlow,
      ready: Effect.Effect<void> = Effect.void,
    ) {
      yield* Stream.runForEach(connection.localIceCandidates, (candidate) =>
        ready
          .pipe(Effect.andThen(attempt.send(candidate)))
          .pipe(Effect.flatMap((envelope) => send(record, envelope))),
      );
      const complete = yield* ready.pipe(
        Effect.andThen(
          attempt.send(
            NegotiationMessage.make({ _tag: 'IceCandidatesComplete' }),
          ),
        ),
      );
      yield* send(record, complete);
    });

    const bind = Effect.fn('WebRtc.bindRpc')(function* (
      record: InternalSession,
      channel: RtcDataChannel,
      attempt: ConnectionAttemptFlow,
    ) {
      if (record.boundSession !== undefined) return;
      const transport = makeRpcTransport({
        localPeerId: options.id,
        remotePeerId: record.remoteId,
        peerSessionId: attempt.peerSessionId,
        connectionAttemptId: attempt.connectionAttemptId,
      });
      let session: PeerSession = record.publicSession;
      if (provider !== undefined && record.consumes !== undefined) {
        const binding = yield* transport.duplex(
          channel,
          provider.group,
          provider.handlers,
          record.consumes,
        );
        session = {
          ...record.publicSession,
          rpc: binding.client,
        } as PeerSession;
      } else if (provider !== undefined) {
        yield* transport.provide(channel, provider.group, provider.handlers);
      } else if (record.consumes !== undefined) {
        const binding = yield* transport.consume(channel, record.consumes);
        session = {
          ...record.publicSession,
          rpc: binding.client,
        } as PeerSession;
      }
      record.boundSession = session;
      if (record.connected) {
        yield* Deferred.succeed(record.ready, session);
      }
    });

    function watchConnection(
      record: InternalSession,
      attempt: ConnectionAttemptFlow,
      connection: RtcConnection,
    ) {
      return Stream.runForEach(connection.state, (rtcState) =>
        Effect.gen(function* () {
          if (
            record.attempt?.connectionAttemptId !== attempt.connectionAttemptId
          ) {
            return;
          }
          if (rtcState === 'connected') {
            record.connecting = false;
            record.connected = true;
            yield* attempt.connected;
            yield* SubscriptionRef.set(record.statusRef, { _tag: 'Connected' });
            if (record.boundSession !== undefined) {
              yield* Deferred.succeed(record.ready, record.boundSession);
            }
          } else if (rtcState === 'disconnected') {
            yield* attempt.transientDisconnected;
            yield* SubscriptionRef.set(record.statusRef, {
              _tag: 'Disconnected',
              rtcState,
            });
          } else if (rtcState === 'failed' || rtcState === 'closed') {
            record.connecting = false;
            record.boundSession = undefined;
            record.connected = false;
            yield* attempt.end(
              rtcState === 'failed'
                ? Activation.failed('RTC connection failed')
                : Activation.completed(),
            );
            yield* SubscriptionRef.set(record.statusRef, {
              _tag: 'Disconnected',
              rtcState,
            });
            if (record.intent && rtcState === 'failed') {
              yield* startAttempt(record).pipe(
                Effect.delay('100 millis'),
                Effect.forkScoped,
              );
            }
          }
        }),
      );
    }

    const startAttempt: (
      record: InternalSession,
    ) => Effect.Effect<void, never, Scope> = Effect.fn('WebRtc.startAttempt')(
      function* (record) {
        if (record.connecting || !record.intent) return;
        record.connecting = true;
        record.boundSession = undefined;
        record.connected = false;
        yield* SubscriptionRef.set(record.statusRef, { _tag: 'Connecting' });
        const attempt = yield* startConnectionAttempt({
          localPeerId: options.id,
          remotePeerId: record.remoteId,
          ...(record.peerSessionId === undefined
            ? {}
            : { peerSessionId: record.peerSessionId }),
        });
        record.peerSessionId = attempt.peerSessionId;
        record.attempt = attempt;
        const connection = yield* platform.makeConnection();
        record.connection = connection;
        const channel = yield* connection.openDataChannel;
        yield* bind(record, channel, attempt);
        const offerSent = yield* Deferred.make<void>();
        yield* sendIce(
          record,
          connection,
          attempt,
          Deferred.await(offerSent),
        ).pipe(Effect.forkScoped({ startImmediately: true }));
        const description = yield* connection.createOffer();
        const offer = yield* attempt.send(
          NegotiationMessage.make({ _tag: 'Offer', description }),
        );
        yield* send(record, offer);
        yield* Deferred.succeed(offerSent, undefined);
        yield* watchConnection(record, attempt, connection).pipe(
          Effect.forkScoped({ startImmediately: true }),
        );
      },
      Effect.catchCause((cause) =>
        Effect.logWarning('WebRTC connection attempt failed').pipe(
          Effect.annotateLogs({ cause: String(cause) }),
        ),
      ),
    );

    const acceptOffer = Effect.fn('WebRtc.acceptOffer')(function* (
      record: InternalSession,
      incoming: NegotiationEnvelope,
    ) {
      if (
        record.attempt !== undefined &&
        record.attempt.connectionAttemptId !== incoming.connectionAttemptId
      ) {
        if (String(options.id) < String(record.remoteId)) {
          const declined = yield* continueConnectionAttempt({
            localPeerId: options.id,
            remotePeerId: record.remoteId,
            incoming,
          });
          const close = yield* declined.reply(
            incoming,
            NegotiationMessage.make({ _tag: 'Close' }),
          );
          yield* send(record, close);
          yield* declined.end(Activation.interrupted('Glare resolved'));
          return;
        }
        yield* record.attempt.end(Activation.interrupted('Glare resolved'));
        if (record.connection !== undefined) {
          yield* record.connection.close;
        }
      }

      const attempt = yield* continueConnectionAttempt({
        localPeerId: options.id,
        remotePeerId: record.remoteId,
        incoming,
      });
      record.peerSessionId = attempt.peerSessionId;
      record.attempt = attempt;
      record.boundSession = undefined;
      record.connected = false;
      record.connecting = true;
      const connection = yield* platform.makeConnection();
      record.connection = connection;
      const answerDescription = yield* connection.acceptOffer(
        incoming.message._tag === 'Offer' ? incoming.message.description : '',
      );
      const answer = yield* attempt.reply(
        incoming,
        NegotiationMessage.make({
          _tag: 'Answer',
          description: answerDescription,
        }),
      );
      yield* send(record, answer);
      yield* sendIce(record, connection, attempt).pipe(
        Effect.forkScoped({ startImmediately: true }),
      );
      yield* Stream.runHead(connection.incomingDataChannels).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.void,
            onSome: (channel) => bind(record, channel, attempt),
          }),
        ),
        Effect.forkScoped({ startImmediately: true }),
      );
      yield* watchConnection(record, attempt, connection).pipe(
        Effect.forkScoped({ startImmediately: true }),
      );
    });

    const onNegotiation = Effect.fn('WebRtc.onNegotiation')(function* ({
      sender,
      envelope,
    }: {
      readonly sender: PeerIdType;
      readonly envelope: NegotiationEnvelope;
    }) {
      const record = yield* recordFor(sender);
      if (envelope.message._tag === 'Offer') {
        yield* acceptOffer(record, envelope);
        return;
      }
      const attempt = record.attempt;
      if (
        attempt === undefined ||
        attempt.connectionAttemptId !== envelope.connectionAttemptId
      ) {
        return;
      }
      attempt.observe(envelope);
      switch (envelope.message._tag) {
        case 'Answer':
          if (record.connection !== undefined) {
            yield* record.connection.acceptAnswer(envelope.message.description);
          }
          break;
        case 'IceCandidate':
          if (record.connection !== undefined) {
            yield* record.connection.addIceCandidate(envelope.message);
          }
          break;
        case 'Close':
          record.intent = false;
          yield* attempt.end(Activation.completed());
          if (record.connection !== undefined) {
            yield* record.connection.close;
          }
          break;
        case 'IceCandidatesComplete':
          break;
      }
    });

    yield* Stream.runForEach(signaling.incoming, (incoming) =>
      onNegotiation(incoming).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning('WebRTC negotiation failed').pipe(
            Effect.annotateLogs({ cause: String(cause) }),
          ),
        ),
      ),
    ).pipe(Effect.forkScoped({ startImmediately: true }));

    const connect = ((connectOptions: {
      readonly id: PeerIdType;
      readonly consumes?: RpcGroup.RpcGroup<Rpc.Any>;
    }) =>
      Effect.gen(function* () {
        const record = yield* recordFor(connectOptions.id);
        record.intent = true;
        if (connectOptions.consumes !== undefined) {
          record.consumes = connectOptions.consumes;
        }
        yield* startAttempt(record).pipe(
          Effect.forkScoped({ startImmediately: true }),
        );
        return yield* Deferred.await(record.ready);
      }).pipe(Effect.mapError(asWebRtcError('connect')))) as Connect;

    const disconnect = Effect.fn('WebRtc.disconnect')(
      function* (remoteId: PeerIdType) {
        const record = records.get(remoteId);
        if (record === undefined) return;
        record.intent = false;
        if (record.attempt !== undefined) {
          const close = yield* record.attempt.send(
            NegotiationMessage.make({ _tag: 'Close' }),
          );
          yield* send(record, close).pipe(Effect.ignore);
          yield* record.attempt.end(Activation.completed());
        }
        if (record.connection !== undefined) {
          yield* record.connection.close;
        }
        records.delete(remoteId);
        yield* SubscriptionRef.update(sessionsRef, (sessions) =>
          sessions.filter(({ remoteId: id }) => id !== remoteId),
        );
      },
      Effect.mapError(asWebRtcError('disconnect')),
    );

    return {
      id: options.id,
      connect,
      sessions: SubscriptionRef.changes(sessionsRef),
      disconnect,
    } satisfies Peer;
  });

export const make = makeInternal as Make;

export const WebRtc = { make } as const;
