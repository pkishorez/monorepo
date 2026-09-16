import { Effect, Layer, Option, PubSub, Stream } from 'effect';
import { RpcClient, RpcSerialization } from 'effect/unstable/rpc';
import {
  layerWebSocketProtocol,
  RpcConnection,
} from 'rpc-toolkit/rpc/websocket-client';
import type { Scope } from 'effect/Scope';
import type { PeerId } from '../../peer-identity/index.js';
import {
  PeerIdInUse,
  Signaling,
  SignalingError,
  type SignalingConnection,
  type SignalingStatus,
} from '../signaling.js';
import {
  DurableSignalingRpcs,
  type IncomingNegotiation,
  type PeerDescriptor,
  type PeerMode,
} from './rpc/index.js';

export interface DurableSignalingOptions {
  readonly url: string;
  readonly peerId: PeerId;
  readonly name: string;
  readonly mode: PeerMode;
}

export interface DurableSignaling {
  readonly peerId: PeerId;
  readonly listPeers: Effect.Effect<
    ReadonlyArray<PeerDescriptor>,
    SignalingError
  >;
  readonly waitForPeer: (
    peerId: PeerId,
  ) => Effect.Effect<PeerDescriptor, SignalingError>;
  readonly signalingLayer: Layer.Layer<Signaling>;
}

const signalingError =
  (operation: SignalingError['operation']) => (cause: unknown) =>
    new SignalingError({ operation, cause });

export const connect = (
  options: DurableSignalingOptions,
): Effect.Effect<DurableSignaling, SignalingError, Scope> =>
  Effect.gen(function* () {
    const url = yield* Effect.try({
      try: () => new URL(options.url, globalThis.location?.href),
      catch: signalingError('open'),
    });
    url.searchParams.set('peerId', options.peerId);
    url.searchParams.set('name', options.name);
    url.searchParams.set('mode', options.mode);

    const protocol = layerWebSocketProtocol({
      url: url.toString(),
      serialization: RpcSerialization.layerJson,
    });
    const runtime = yield* Effect.gen(function* () {
      const client = yield* RpcClient.make(DurableSignalingRpcs);
      const connection = yield* RpcConnection;
      return { client, connection };
    }).pipe(Effect.provide(protocol));

    yield* runtime.connection.connectionStatus.pipe(
      Stream.filter((status) => status === 'connected'),
      Stream.runHead,
      Effect.timeout('10 seconds'),
      Effect.mapError(signalingError('open')),
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.fail(signalingError('open')('Connection ended')),
          onSome: () => Effect.void,
        }),
      ),
    );

    const inbox = yield* PubSub.unbounded<IncomingNegotiation>();
    yield* Effect.addFinalizer(() => PubSub.shutdown(inbox));
    yield* runtime.connection
      .keepSubscribed(() => runtime.client.ReceiveNegotiations())
      .pipe(
        Stream.runForEach((message) => PubSub.publish(inbox, message)),
        Effect.ignore,
        Effect.forkScoped({ startImmediately: true }),
      );
    yield* Effect.yieldNow;

    const status = runtime.connection.connectionStatus.pipe(
      Stream.map((value): SignalingStatus =>
        value === 'connected'
          ? 'Available'
          : value === 'connecting'
            ? 'Connecting'
            : 'Unavailable',
      ),
    );

    const waitForPeer = (peerId: PeerId) =>
      runtime.connection
        .keepSubscribed(() => runtime.client.WaitForPeer({ peerId }))
        .pipe(
          Stream.runHead,
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new Error('Peer wait ended')),
              onSome: Effect.succeed,
            }),
          ),
          Effect.mapError(signalingError('receive')),
        );

    const signalingLayer = Layer.succeed(
      Signaling,
      Signaling.of({
        open: (self) =>
          self !== options.peerId
            ? Effect.fail(new PeerIdInUse({ peerId: self }))
            : Effect.succeed({
                peerId: self,
                send: (recipient, envelope) =>
                  runtime.client
                    .SendNegotiation({ recipient, envelope })
                    .pipe(Effect.mapError(signalingError('send'))),
                incoming: Stream.fromPubSub(inbox),
                status,
                waitForPeer: (peerId) =>
                  waitForPeer(peerId).pipe(Effect.asVoid),
              } satisfies SignalingConnection),
      }),
    );

    return {
      peerId: options.peerId,
      listPeers: runtime.client
        .ListPeers()
        .pipe(Effect.mapError(signalingError('receive'))),
      waitForPeer,
      signalingLayer,
    };
  });

export const DurableSignaling = { connect } as const;
