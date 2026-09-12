import { Activation } from '@pkishorez/effect-tracer/flow';
import {
  Deferred,
  Effect,
  Layer,
  Option,
  PubSub,
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
    readonly operation: 'make' | 'connect' | 'get-remote-peer' | 'disconnect',
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
  readonly connect: Connect<DefaultRemote>;
  readonly getRemotePeer: GetRemotePeer<DefaultRemote>;
  readonly getCurrentRemotePeers: () => Effect.Effect<
    ReadonlyArray<DefaultSession<DefaultRemote>>
  >;
  readonly onRemotePeer: <E, R>(
    handler: (
      remote: DefaultSession<DefaultRemote>,
    ) => Effect.Effect<void, E, R>,
  ) => Effect.Effect<void, E, Scope | R>;
  readonly sessions: Stream.Stream<ReadonlyArray<PeerSession>>;
  readonly disconnect: (
    remoteId: PeerIdType,
  ) => Effect.Effect<void, WebRtcError>;
}

interface BaseMakeOptions {
  readonly id: PeerIdType;
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
    | Scope
    | R
    | Rpc.Middleware<Local>
    | Rpc.ServicesServer<Local>
  >;

  (
    options: BaseMakeOptions,
  ): Effect.Effect<
    Peer<never>,
    WebRtcError,
    Signaling | WebRtcPlatform | Scope
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
}

const asWebRtcError =
  (operation: WebRtcError['operation']) => (cause: unknown) =>
    new WebRtcError(operation, cause);

const makeInternal: (
  options: BaseMakeOptions | ServerMakeOptions<Rpc.Any, unknown, unknown>,
) => Effect.Effect<
  Peer<Rpc.Any>,
  WebRtcError,
  Signaling | WebRtcPlatform | Scope
> = Effect.fn('WebRtc.make')(function* (options) {
  const signalingService = yield* Signaling;
  const platform = yield* WebRtcPlatform;
  const signaling = yield* signalingService
    .open(options.id)
    .pipe(Effect.mapError(asWebRtcError('make')));
  const server = 'serve' in options ? (options.serve as Server) : undefined;
  const records = new Map<PeerIdType, InternalSession>();
  const remotePeers = yield* PubSub.unbounded<PeerSession>();
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
    const remoteReady = yield* Deferred.make<
      RemotePeer<Rpc.Any>,
      WebRtcError
    >();
    const created: InternalSession = {
      remoteId,
      statusRef,
      publicSession,
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
    };
    records.set(remoteId, created);
    yield* SubscriptionRef.update(sessionsRef, (sessions) => [
      ...sessions,
      publicSession,
    ]);
    return created;
  });

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
    );
    record.transport = transport;
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
          yield* attempt.connected;
          yield* SubscriptionRef.set(record.statusRef, { _tag: 'Connected' });
          if (record.boundSession !== undefined) {
            yield* Deferred.succeed(record.ready, record.boundSession);
            yield* announce(record);
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
          record.transport = undefined;
          record.client = undefined;
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
      if (record.connected || record.connecting || !record.intent) return;
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
        yield* removeRecord(record);
        break;
      case 'IceCandidatesComplete':
        if (record.connection !== undefined) {
          yield* record.connection.completeIceCandidates;
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
    },
    Effect.mapError(asWebRtcError('disconnect')),
  );

  return {
    id: options.id,
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
