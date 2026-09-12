import { Activation } from '@pkishorez/effect-tracer/flow';
import {
  Deferred,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  PubSub,
  Stream,
  SubscriptionRef,
} from 'effect';
import * as Scope from 'effect/Scope';
import type { Rpc, RpcClient, RpcGroup } from 'effect/unstable/rpc';
import {
  continueConnectionAttempt,
  startConnectionAttempt,
} from '../flow-tracing/index.js';
import type {
  ConnectionAttemptId,
  NegotiationEnvelope,
  PeerSessionId,
} from '../negotiation/index.js';
import { NegotiationMessage } from '../negotiation/index.js';
import type {
  RtcConfiguration,
  RtcConnection,
  RtcDataChannel,
  RtcDiagnostic,
} from '../platform/platform.js';
import { RtcError, WebRtcPlatform } from '../platform/platform.js';
import { PeerId as PeerIdSchema } from '../peer-identity/index.js';
import type { PeerId as PeerIdType } from '../peer-identity/index.js';
import { make as makeRpcTransport } from '../rpc/index.js';
import { Signaling } from '../signaling/signaling.js';
import type {
  SignalingEvent,
  SignalingStatus,
} from '../signaling/signaling.js';
import {
  transition,
  type ConnectionPhase,
  type NegotiationRole,
  type RecoveryReason,
  type SessionState,
  type SessionTransition,
} from './session-state.js';

type ConnectionAttemptFlow = Effect.Success<
  ReturnType<typeof startConnectionAttempt>
>;

/** Canonical constructor and Schema for Peer Identifiers. */
export const PeerId = PeerIdSchema;
export type PeerId = PeerIdType;

export type SessionStatus = SessionState;
export type { ConnectionPhase, NegotiationRole, RecoveryReason };

export type SessionEvent =
  | {
      readonly _tag: 'AttemptStarted' | 'AttemptSuperseded';
      readonly attemptId: ConnectionAttemptId;
    }
  | {
      readonly _tag:
        | 'OfferSent'
        | 'OfferReceived'
        | 'AnswerSent'
        | 'AnswerReceived'
        | 'DataChannelOpened'
        | 'HeartbeatSent'
        | 'HeartbeatReceived'
        | 'HeartbeatTimedOut';
      readonly attemptId: ConnectionAttemptId;
    }
  | { readonly _tag: 'IceStateChanged'; readonly state: string }
  | { readonly _tag: 'SessionClosed'; readonly reason: 'local' | 'remote' };

export class WebRtcError extends Error {
  readonly _tag = 'WebRtcError';
  constructor(
    readonly operation: 'make' | 'connect' | 'get-remote-peer' | 'disconnect',
    readonly cause: unknown,
  ) {
    super(`WebRTC ${operation} failed`);
  }
}

export interface PeerSession {
  readonly remoteId: PeerIdType;
  readonly status: Stream.Stream<SessionStatus>;
  readonly events: Stream.Stream<SessionEvent>;
}

export interface RemotePeer<Remote extends Rpc.Any> extends PeerSession {
  readonly rpc: RpcClient.RpcClient<Remote>;
}

type DefaultSession<Remote extends Rpc.Any | never> = [Remote] extends [never]
  ? PeerSession
  : RemotePeer<Remote>;

export interface Connect<DefaultRemote extends Rpc.Any | never> {
  <Remote extends Rpc.Any>(options: {
    readonly id: PeerIdType;
    readonly contract: RpcGroup.RpcGroup<Remote>;
  }): Effect.Effect<RemotePeer<Remote>, WebRtcError>;

  (options: {
    readonly id: PeerIdType;
  }): Effect.Effect<DefaultSession<DefaultRemote>, WebRtcError>;
}

export interface GetRemotePeer<DefaultRemote extends Rpc.Any | never> {
  <Remote extends Rpc.Any>(options: {
    readonly id: PeerIdType;
    readonly contract: RpcGroup.RpcGroup<Remote>;
  }): Effect.Effect<RemotePeer<Remote>, WebRtcError>;

  (options: {
    readonly id: PeerIdType;
  }): Effect.Effect<DefaultSession<DefaultRemote>, WebRtcError>;
}

export interface Peer<DefaultRemote extends Rpc.Any | never = never> {
  readonly id: PeerIdType;
  readonly signalingStatus: Stream.Stream<SignalingStatus>;
  readonly signalingEvents: Stream.Stream<SignalingEvent>;
  readonly connect: Connect<DefaultRemote>;
  readonly getRemotePeer: GetRemotePeer<DefaultRemote>;
  readonly getCurrentRemotePeers: () => Effect.Effect<
    ReadonlyArray<DefaultSession<DefaultRemote>>
  >;
  readonly onRemotePeer: <E, R>(
    handler: (
      remote: DefaultSession<DefaultRemote>,
    ) => Effect.Effect<void, E, R>,
  ) => Effect.Effect<void, E, Scope.Scope | R>;
  readonly sessions: Stream.Stream<ReadonlyArray<PeerSession>>;
  readonly disconnect: (
    remoteId: PeerIdType,
  ) => Effect.Effect<void, WebRtcError>;
}

interface BaseMakeOptions {
  readonly id: PeerIdType;
  /**
   * Passed to every RTC Connection this Peer creates. Without ICE servers,
   * Peers only gather host candidates, which rarely reach across networks.
   */
  readonly rtc?: RtcConfiguration;
  readonly lifecycle?: {
    readonly answerTimeout?: Duration.Input;
    readonly establishmentTimeout?: Duration.Input;
    readonly heartbeatInterval?: Duration.Input;
    readonly heartbeatTimeout?: Duration.Input;
  };
}

interface ServerMakeOptions<
  Local extends Rpc.Any,
  E,
  R,
> extends BaseMakeOptions {
  readonly serve: {
    readonly contract: RpcGroup.RpcGroup<Local>;
    readonly handlers: Layer.Layer<Rpc.ToHandler<Local>, E, R>;
  };
}

export interface Make {
  <Local extends Rpc.Any, E, R>(
    options: ServerMakeOptions<Local, E, R>,
  ): Effect.Effect<
    Peer<Local>,
    WebRtcError | E,
    | Signaling
    | WebRtcPlatform
    | Scope.Scope
    | R
    | Rpc.Middleware<Local>
    | Rpc.ServicesServer<Local>
  >;

  (
    options: BaseMakeOptions,
  ): Effect.Effect<
    Peer<never>,
    WebRtcError,
    Signaling | WebRtcPlatform | Scope.Scope
  >;
}

interface Server {
  readonly contract: RpcGroup.RpcGroup<Rpc.Any>;
  readonly handlers: Layer.Layer<Rpc.ToHandler<Rpc.Any>>;
}

type AnyRpcClient = Record<
  PropertyKey,
  (...args: ReadonlyArray<unknown>) => Effect.Effect<unknown, unknown>
>;

interface InternalSession {
  readonly remoteId: PeerIdType;
  readonly statusRef: SubscriptionRef.SubscriptionRef<SessionStatus>;
  readonly publicSession: PeerSession;
  readonly events: PubSub.PubSub<SessionEvent>;
  readonly ready: Deferred.Deferred<PeerSession, WebRtcError>;
  readonly remoteReady: Deferred.Deferred<RemotePeer<Rpc.Any>, WebRtcError>;
  client: AnyRpcClient | undefined;
  intent: boolean;
  peerSessionId?: PeerSessionId;
  contract?: RpcGroup.RpcGroup<Rpc.Any>;
  transport: Effect.Success<ReturnType<typeof makeRpcTransport>> | undefined;
  connection?: RtcConnection;
  attempt?: ConnectionAttemptFlow;
  boundSession: PeerSession | undefined;
  connected: boolean;
  connecting: boolean;
  remotePeer?: RemotePeer<Rpc.Any>;
  announced: boolean;
  state: SessionState;
  answerReceived: boolean;
  retries: number;
  attemptScope: Scope.Closeable | undefined;
}

const asWebRtcError =
  (operation: WebRtcError['operation']) => (cause: unknown) =>
    new WebRtcError(operation, cause);

const errorAttributes = (error: unknown) =>
  error instanceof RtcError
    ? { operation: error.operation, error: String(error.cause) }
    : { error: String(error) };

/** Records a failed negotiation step in its Flow before the failure spreads. */
const traced = <A, E, R>(
  attempt: ConnectionAttemptFlow,
  step: string,
  effect: Effect.Effect<A, E, R>,
) =>
  effect.pipe(
    Effect.tapError((error) =>
      attempt.note(`${step} failed`, {
        level: 'error',
        attributes: { step, ...errorAttributes(error) },
      }),
    ),
  );

const diagnosticNote = (
  attempt: ConnectionAttemptFlow,
  diagnostic: RtcDiagnostic,
) => {
  switch (diagnostic._tag) {
    case 'IceConnectionState':
      return attempt.note(`ICE connection ${diagnostic.state}`, {
        level:
          diagnostic.state === 'failed'
            ? 'error'
            : diagnostic.state === 'disconnected'
              ? 'warning'
              : 'info',
        attributes: { iceConnectionState: diagnostic.state },
      });
    case 'IceGatheringState':
      return attempt.note(`ICE gathering ${diagnostic.state}`, {
        attributes: { iceGatheringState: diagnostic.state },
      });
    case 'IceCandidateError':
      return attempt.note('ICE candidate error', {
        level: 'warning',
        attributes: {
          url: diagnostic.url,
          errorCode: diagnostic.errorCode,
          errorText: diagnostic.errorText,
          address: diagnostic.address,
          port: diagnostic.port,
        },
      });
  }
};

const watchDiagnostics = (
  events: PubSub.PubSub<SessionEvent>,
  attempt: ConnectionAttemptFlow,
  connection: RtcConnection,
) =>
  Stream.runForEach(connection.diagnostics ?? Stream.empty, (diagnostic) =>
    diagnosticNote(attempt, diagnostic).pipe(
      Effect.andThen(
        diagnostic._tag === 'IceConnectionState'
          ? PubSub.publish(events, {
              _tag: 'IceStateChanged',
              state: diagnostic.state,
            })
          : Effect.void,
      ),
    ),
  ).pipe(Effect.forkScoped({ startImmediately: true }), Effect.asVoid);

const makeInternal: (
  options: BaseMakeOptions | ServerMakeOptions<Rpc.Any, unknown, unknown>,
) => Effect.Effect<
  Peer<Rpc.Any>,
  WebRtcError,
  Signaling | WebRtcPlatform | Scope.Scope
> = Effect.fn('WebRtc.make')(function* (options) {
  const signalingService = yield* Signaling;
  const platform = yield* WebRtcPlatform;
  const peerScope = yield* Scope.Scope;
  const signaling = yield* signalingService
    .open(options.id)
    .pipe(Effect.mapError(asWebRtcError('make')));
  const lifecycle = {
    answerTimeout: options.lifecycle?.answerTimeout ?? '15 seconds',
    establishmentTimeout:
      options.lifecycle?.establishmentTimeout ?? '15 seconds',
    heartbeatInterval: options.lifecycle?.heartbeatInterval ?? '5 seconds',
    heartbeatTimeout: options.lifecycle?.heartbeatTimeout ?? '10 seconds',
  } as const;
  const server = 'serve' in options ? (options.serve as Server) : undefined;
  const records = new Map<PeerIdType, InternalSession>();
  const remotePeers = yield* PubSub.unbounded<PeerSession>();
  const sessionsRef = yield* SubscriptionRef.make<ReadonlyArray<PeerSession>>(
    [],
  );

  const recordFor = Effect.fn('WebRtc.recordFor')(function* (
    remoteId: PeerIdType,
    role: NegotiationRole = 'Initiator',
  ) {
    const existing = records.get(remoteId);
    if (existing !== undefined) return existing;
    const initialState: SessionState = {
      _tag: 'Connecting',
      role,
      phase: role === 'Initiator' ? 'waiting-for-peer' : 'negotiating',
    };
    const statusRef = yield* SubscriptionRef.make<SessionStatus>(initialState);
    const events = yield* PubSub.unbounded<SessionEvent>();
    const publicSession: PeerSession = {
      remoteId,
      status: SubscriptionRef.changes(statusRef),
      events: Stream.fromPubSub(events),
    };
    const ready = yield* Deferred.make<PeerSession, WebRtcError>();
    const remoteReady = yield* Deferred.make<
      RemotePeer<Rpc.Any>,
      WebRtcError
    >();
    const created: InternalSession = {
      remoteId,
      statusRef,
      publicSession,
      events,
      ready,
      remoteReady,
      client: undefined,
      intent: false,
      ...(server === undefined ? {} : { contract: server.contract }),
      boundSession: undefined,
      connected: false,
      connecting: false,
      transport: undefined,
      announced: false,
      state: initialState,
      answerReceived: false,
      retries: 0,
      attemptScope: undefined,
    };
    records.set(remoteId, created);
    yield* SubscriptionRef.update(sessionsRef, (sessions) => [
      ...sessions,
      publicSession,
    ]);
    return created;
  });

  const move = (record: InternalSession, event: SessionTransition) =>
    Effect.sync(() => {
      record.state = transition(record.state, event);
      return record.state;
    }).pipe(
      Effect.flatMap((state) => SubscriptionRef.set(record.statusRef, state)),
    );

  const emit = (record: InternalSession, event: SessionEvent) =>
    PubSub.publish(record.events, event).pipe(Effect.asVoid);

  const closeAttemptScope = Effect.fn('WebRtc.closeAttemptScope')(function* (
    record: InternalSession,
  ) {
    const scope = record.attemptScope;
    record.attemptScope = undefined;
    if (scope !== undefined) yield* Scope.close(scope, Exit.void);
  });

  const replaceAttemptScope = Effect.fn('WebRtc.replaceAttemptScope')(
    function* (record: InternalSession) {
      yield* closeAttemptScope(record);
      const scope = yield* Scope.make();
      record.attemptScope = scope;
      return scope;
    },
  );

  yield* Effect.addFinalizer(() =>
    Effect.forEach(records.values(), closeAttemptScope, { discard: true }),
  );

  const makeRemotePeer = (record: InternalSession) => {
    if (record.remotePeer !== undefined) return record.remotePeer;
    const remote = { ...record.publicSession } as RemotePeer<Rpc.Any>;
    Object.defineProperty(remote, 'rpc', {
      enumerable: true,
      get: () => {
        if (record.client === undefined) {
          throw new Error('The Remote Peer is not connected');
        }
        return record.client;
      },
    });
    record.remotePeer = remote;
    return remote;
  };

  const announce = Effect.fn('WebRtc.announceRemotePeer')(function* (
    record: InternalSession,
  ) {
    if (!record.connected || record.boundSession === undefined) return;
    if (record.remotePeer !== undefined) {
      yield* Deferred.succeed(record.remoteReady, record.remotePeer);
    }
    if (!record.announced) {
      record.announced = true;
      yield* PubSub.publish(remotePeers, record.boundSession);
    }
  });

  const removeRecord = (record: InternalSession) =>
    Effect.sync(() => records.delete(record.remoteId)).pipe(
      Effect.andThen(
        SubscriptionRef.update(sessionsRef, (sessions) =>
          sessions.filter(({ remoteId }) => remoteId !== record.remoteId),
        ),
      ),
    );

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
    const transport = yield* makeRpcTransport(
      {
        localPeerId: options.id,
        remotePeerId: record.remoteId,
        peerSessionId: attempt.peerSessionId,
        connectionAttemptId: attempt.connectionAttemptId,
      },
      channel,
      lifecycle,
    );
    record.transport = transport;
    yield* Stream.runForEach(transport.events, (event) => {
      if (event._tag === 'HeartbeatTimedOut') {
        return move(record, {
          _tag: 'Lost',
          reason: 'heartbeat-timeout',
        }).pipe(
          Effect.andThen(
            emit(record, {
              _tag: 'HeartbeatTimedOut',
              attemptId: attempt.connectionAttemptId,
            }),
          ),
          Effect.andThen(record.connection?.close ?? Effect.void),
        );
      }
      if (event._tag === 'CloseReceived') {
        return Effect.sync(() => {
          record.intent = false;
        }).pipe(
          Effect.andThen(
            emit(record, { _tag: 'SessionClosed', reason: 'remote' }),
          ),
          Effect.andThen(record.connection?.close ?? Effect.void),
          Effect.andThen(removeRecord(record)),
          Effect.andThen(Effect.forkIn(closeAttemptScope(record), peerScope)),
        );
      }
      if (
        event._tag === 'HeartbeatSent' ||
        event._tag === 'HeartbeatReceived'
      ) {
        return emit(record, {
          _tag: event._tag,
          attemptId: attempt.connectionAttemptId,
        });
      }
      return Effect.void;
    }).pipe(Effect.forkScoped({ startImmediately: true }));
    if (server !== undefined) {
      yield* transport.serve(server.contract, server.handlers);
    }
    if (record.contract !== undefined) {
      const binding = yield* transport.consume(record.contract);
      record.client = binding.client as unknown as AnyRpcClient;
      record.boundSession = makeRemotePeer(record);
    } else {
      record.boundSession = record.publicSession;
    }
    if (record.connected) {
      yield* Deferred.succeed(record.ready, record.boundSession);
      yield* announce(record);
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
          record.retries = 0;
          yield* attempt.connected;
          yield* move(record, { _tag: 'Connected' });
          yield* emit(record, {
            _tag: 'DataChannelOpened',
            attemptId: attempt.connectionAttemptId,
          });
          if (record.boundSession !== undefined) {
            yield* Deferred.succeed(record.ready, record.boundSession);
            yield* announce(record);
          }
        } else if (rtcState === 'disconnected') {
          yield* attempt.transientDisconnected;
          yield* move(record, {
            _tag: 'Lost',
            reason: 'rtc-disconnected',
          });
        } else if (rtcState === 'failed' || rtcState === 'closed') {
          record.connecting = false;
          record.boundSession = undefined;
          record.connected = false;
          record.transport = undefined;
          record.client = undefined;
          if (rtcState === 'failed') {
            const report =
              connection.report === undefined ? {} : yield* connection.report;
            yield* attempt.end(
              Activation.failed('RTC connection failed'),
              report,
            );
          } else {
            yield* attempt.end(Activation.completed());
          }
          if (record.intent && record.state._tag !== 'Reconnecting') {
            yield* move(record, {
              _tag: 'Lost',
              reason: 'rtc-failed',
            });
          }
          if (record.intent) {
            yield* Effect.forkIn(startAttempt(record), peerScope);
          }
        }
      }),
    );
  }

  function startAttempt(
    record: InternalSession,
  ): Effect.Effect<void, never, Scope.Scope> {
    return Effect.gen(function* () {
      if (record.connected || record.connecting || !record.intent) return;
      const attemptScope = yield* replaceAttemptScope(record);
      yield* Effect.gen(function* () {
        record.connecting = true;
        record.boundSession = undefined;
        record.connected = false;
        const attempt = yield* startConnectionAttempt({
          localPeerId: options.id,
          remotePeerId: record.remoteId,
          ...(record.peerSessionId === undefined
            ? {}
            : { peerSessionId: record.peerSessionId }),
        });
        record.peerSessionId = attempt.peerSessionId;
        record.attempt = attempt;
        record.answerReceived = false;
        yield* move(record, {
          _tag: 'AttemptStarted',
          role: 'Initiator',
          attemptId: attempt.connectionAttemptId,
        });
        yield* emit(record, {
          _tag: 'AttemptStarted',
          attemptId: attempt.connectionAttemptId,
        });
        const connection = yield* traced(
          attempt,
          'Create RTC connection',
          platform.makeConnection(options.rtc),
        );
        record.connection = connection;
        yield* watchDiagnostics(record.events, attempt, connection);
        const channel = yield* traced(
          attempt,
          'Open data channel',
          connection.openDataChannel,
        );
        yield* bind(record, channel, attempt);
        const offerSent = yield* Deferred.make<void>();
        yield* sendIce(
          record,
          connection,
          attempt,
          Deferred.await(offerSent),
        ).pipe(Effect.forkScoped({ startImmediately: true }));
        const description = yield* traced(
          attempt,
          'Create offer',
          connection.createOffer(),
        );
        const offer = yield* attempt.send(
          NegotiationMessage.make({ _tag: 'Offer', description }),
        );
        yield* send(record, offer);
        yield* emit(record, {
          _tag: 'OfferSent',
          attemptId: attempt.connectionAttemptId,
        });
        yield* Deferred.succeed(offerSent, undefined);
        yield* watchConnection(record, attempt, connection).pipe(
          Effect.forkScoped({ startImmediately: true }),
        );
        yield* Effect.sleep(lifecycle.answerTimeout).pipe(
          Effect.andThen(
            Effect.suspend(() => {
              if (
                record.attempt?.connectionAttemptId !==
                  attempt.connectionAttemptId ||
                record.answerReceived ||
                record.connected
              ) {
                return Effect.void;
              }
              record.connecting = false;
              return move(record, {
                _tag: 'Lost',
                reason: 'answer-timeout',
              }).pipe(Effect.andThen(connection.close));
            }),
          ),
          Effect.forkScoped({ startImmediately: true }),
        );
      }).pipe(Effect.provideService(Scope.Scope, attemptScope));
    }).pipe(
      Effect.catchCause((cause) => {
        record.connecting = false;
        const delay = Math.min(250 * 2 ** record.retries, 10_000);
        record.retries += 1;
        return Effect.logWarning('WebRTC connection attempt failed').pipe(
          Effect.annotateLogs({ cause: String(cause) }),
          Effect.andThen(
            Effect.forkIn(
              Effect.sleep(`${delay} millis`).pipe(
                Effect.andThen(
                  Effect.suspend(() =>
                    record.intent ? startAttempt(record) : Effect.void,
                  ),
                ),
              ),
              peerScope,
            ),
          ),
          Effect.asVoid,
        );
      }),
    );
  }

  const acceptOffer = Effect.fn('WebRtc.acceptOffer')(function* (
    record: InternalSession,
    incoming: NegotiationEnvelope,
  ) {
    let superseded: RtcConnection | undefined;
    if (
      record.attempt !== undefined &&
      record.attempt.connectionAttemptId !== incoming.connectionAttemptId
    ) {
      const offerPending =
        record.connecting &&
        record.state.role === 'Initiator' &&
        !record.answerReceived;
      if (offerPending && String(options.id) < String(record.remoteId)) {
        return;
      }
      superseded = record.connection;
      yield* record.attempt.end(Activation.interrupted('Glare resolved'));
      yield* emit(record, {
        _tag: 'AttemptSuperseded',
        attemptId: record.attempt.connectionAttemptId,
      });
    }

    const attempt = yield* continueConnectionAttempt({
      localPeerId: options.id,
      remotePeerId: record.remoteId,
      incoming,
    });
    record.peerSessionId = attempt.peerSessionId;
    record.attempt = attempt;
    if (superseded !== undefined) yield* superseded.close;
    const attemptScope = yield* replaceAttemptScope(record);
    yield* Effect.gen(function* () {
      record.boundSession = undefined;
      record.transport = undefined;
      record.client = undefined;
      record.connected = false;
      record.connecting = true;
      record.answerReceived = true;
      yield* move(record, {
        _tag: 'BecameResponder',
        attemptId: attempt.connectionAttemptId,
      });
      yield* emit(record, {
        _tag: 'OfferReceived',
        attemptId: attempt.connectionAttemptId,
      });
      const connection = yield* traced(
        attempt,
        'Create RTC connection',
        platform.makeConnection(options.rtc),
      );
      record.connection = connection;
      yield* watchDiagnostics(record.events, attempt, connection);
      const answerDescription = yield* traced(
        attempt,
        'Accept offer',
        connection.acceptOffer(
          incoming.message._tag === 'Offer' ? incoming.message.description : '',
        ),
      );
      const answer = yield* attempt.reply(
        incoming,
        NegotiationMessage.make({
          _tag: 'Answer',
          description: answerDescription,
        }),
      );
      yield* send(record, answer);
      yield* emit(record, {
        _tag: 'AnswerSent',
        attemptId: attempt.connectionAttemptId,
      });
      yield* move(record, { _tag: 'DataChannelOpening' });
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
      yield* Effect.sleep(lifecycle.establishmentTimeout).pipe(
        Effect.andThen(
          Effect.suspend(() =>
            record.attempt?.connectionAttemptId ===
              attempt.connectionAttemptId && !record.connected
              ? move(record, {
                  _tag: 'Lost',
                  reason: 'establishment-timeout',
                }).pipe(Effect.andThen(connection.close))
              : Effect.void,
          ),
        ),
        Effect.forkScoped({ startImmediately: true }),
      );
    }).pipe(Effect.provideService(Scope.Scope, attemptScope));
  });

  const onNegotiation = Effect.fn('WebRtc.onNegotiation')(function* ({
    sender,
    envelope,
  }: {
    readonly sender: PeerIdType;
    readonly envelope: NegotiationEnvelope;
  }) {
    if (envelope.message._tag === 'Offer') {
      const record = yield* recordFor(sender, 'Responder');
      record.intent = true;
      yield* acceptOffer(record, envelope);
      return;
    }
    const record = records.get(sender);
    if (record === undefined) return;
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
        record.answerReceived = true;
        yield* move(record, { _tag: 'AnswerReceived' });
        yield* emit(record, {
          _tag: 'AnswerReceived',
          attemptId: attempt.connectionAttemptId,
        });
        if (record.connection !== undefined) {
          yield* traced(
            attempt,
            'Accept answer',
            record.connection.acceptAnswer(envelope.message.description),
          );
          yield* move(record, { _tag: 'DataChannelOpening' });
          const connection = record.connection;
          yield* Effect.sleep(lifecycle.establishmentTimeout).pipe(
            Effect.andThen(
              Effect.suspend(() =>
                record.attempt?.connectionAttemptId ===
                  attempt.connectionAttemptId && !record.connected
                  ? move(record, {
                      _tag: 'Lost',
                      reason: 'establishment-timeout',
                    }).pipe(Effect.andThen(connection.close))
                  : Effect.void,
              ),
            ),
            Effect.forkScoped({ startImmediately: true }),
          );
        }
        break;
      case 'IceCandidate':
        if (record.connection !== undefined) {
          yield* traced(
            attempt,
            'Add ICE candidate',
            record.connection.addIceCandidate(envelope.message),
          );
        }
        break;
      case 'Close':
        record.intent = false;
        yield* emit(record, { _tag: 'SessionClosed', reason: 'remote' });
        yield* attempt.end(Activation.completed());
        if (record.connection !== undefined) {
          yield* record.connection.close;
        }
        yield* removeRecord(record);
        yield* closeAttemptScope(record);
        break;
      case 'IceCandidatesComplete':
        if (record.connection !== undefined) {
          yield* traced(
            attempt,
            'Complete ICE candidates',
            record.connection.completeIceCandidates,
          );
        }
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

  const setContract = Effect.fn('WebRtc.setContract')(function* (
    record: InternalSession,
    contract?: RpcGroup.RpcGroup<Rpc.Any>,
  ) {
    if (contract === undefined || record.contract === contract) return;
    record.contract = contract;
    if (record.transport !== undefined) {
      const binding = yield* record.transport.consume(contract);
      record.client = binding.client as unknown as AnyRpcClient;
      record.boundSession = makeRemotePeer(record);
      yield* announce(record);
    }
  });

  const remoteFor = Effect.fn('WebRtc.remoteFor')(function* (
    record: InternalSession,
    contract?: RpcGroup.RpcGroup<Rpc.Any>,
  ) {
    yield* setContract(record, contract);
    if (contract === undefined) return yield* Deferred.await(record.ready);
    return yield* Deferred.await(record.remoteReady);
  });

  const connect = ((connectOptions: {
    readonly id: PeerIdType;
    readonly contract?: RpcGroup.RpcGroup<Rpc.Any>;
  }) =>
    Effect.gen(function* () {
      const record = yield* recordFor(connectOptions.id);
      record.intent = true;
      const contract = connectOptions.contract ?? server?.contract;
      yield* setContract(record, contract);
      yield* startAttempt(record).pipe(
        Effect.forkScoped({ startImmediately: true }),
      );
      return yield* remoteFor(record, contract);
    }).pipe(Effect.mapError(asWebRtcError('connect')))) as Connect<Rpc.Any>;

  const getRemotePeer = ((remoteOptions: {
    readonly id: PeerIdType;
    readonly contract?: RpcGroup.RpcGroup<Rpc.Any>;
  }) =>
    Effect.gen(function* () {
      const record = yield* recordFor(remoteOptions.id);
      return yield* remoteFor(
        record,
        remoteOptions.contract ?? server?.contract,
      );
    }).pipe(
      Effect.mapError(asWebRtcError('get-remote-peer')),
    )) as GetRemotePeer<Rpc.Any>;

  const getCurrentRemotePeers = () =>
    Effect.sync(() =>
      [...records.values()]
        .filter(
          (record) => record.connected && record.boundSession !== undefined,
        )
        .map((record) => record.boundSession!),
    );

  const onRemotePeer = <E, R>(
    handler: (remote: PeerSession) => Effect.Effect<void, E, R>,
  ) => Stream.runForEach(Stream.fromPubSub(remotePeers), handler);

  const disconnect = Effect.fn('WebRtc.disconnect')(
    function* (remoteId: PeerIdType) {
      const record = records.get(remoteId);
      if (record === undefined) return;
      record.intent = false;
      if (record.transport !== undefined) {
        yield* record.transport.closeRemote;
      }
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
      yield* removeRecord(record);
      yield* closeAttemptScope(record);
    },
    Effect.mapError(asWebRtcError('disconnect')),
  );

  return {
    id: options.id,
    signalingStatus: signaling.status,
    signalingEvents: signaling.events,
    connect,
    getRemotePeer,
    getCurrentRemotePeers,
    onRemotePeer,
    sessions: SubscriptionRef.changes(sessionsRef),
    disconnect,
  } as unknown as Peer<Rpc.Any>;
});

export const make = makeInternal as Make;

export const WebRtc = { make } as const;
