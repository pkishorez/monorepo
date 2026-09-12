import { Activation } from '@pkishorez/effect-tracer/flow';
import {
  Clock,
  Data,
  Deferred,
  Duration,
  Effect,
  Layer,
  Option,
  PubSub,
  Queue,
  Stream,
} from 'effect';
import type { Scope } from 'effect/Scope';
import {
  RpcClient,
  RpcClientError,
  RpcSerialization,
  RpcServer,
} from 'effect/unstable/rpc';
import type { Rpc, RpcGroup, RpcMessage } from 'effect/unstable/rpc';
import {
  continueRpcInvocation,
  startRpcInvocation,
} from '../flow-tracing/index.js';
import type {
  ConnectionAttemptId,
  PeerSessionId,
} from '../negotiation/index.js';
import type { PeerId } from '../peer-identity/index.js';
import type { RtcDataChannel } from '../platform/platform.js';

type OutgoingRpcFlow = Effect.Success<ReturnType<typeof startRpcInvocation>>;
type IncomingRpcFlow = Effect.Success<ReturnType<typeof continueRpcInvocation>>;

export class RpcTransportError extends Data.TaggedError('RpcTransportError')<{
  readonly operation: 'open' | 'consume' | 'serve';
  readonly cause: unknown;
}> {}

export interface RpcPeerContext {
  readonly localPeerId: PeerId;
  readonly remotePeerId: PeerId;
  readonly peerSessionId: PeerSessionId;
  readonly connectionAttemptId: ConnectionAttemptId;
}

export interface RpcBinding<Remote extends Rpc.Any> {
  readonly client: RpcClient.RpcClient<Remote>;
}

export interface RpcTransport {
  readonly consume: <Remote extends Rpc.Any>(
    remote: RpcGroup.RpcGroup<Remote>,
  ) => Effect.Effect<RpcBinding<Remote>, RpcTransportError, Scope>;

  readonly serve: <Local extends Rpc.Any, E, R>(
    local: RpcGroup.RpcGroup<Local>,
    handlers: Layer.Layer<Rpc.ToHandler<Local>, E, R>,
  ) => Effect.Effect<
    void,
    RpcTransportError | E,
    Scope | R | Rpc.Middleware<Local> | Rpc.ServicesServer<Local>
  >;
  readonly events: Stream.Stream<RpcTransportEvent>;
  readonly closeRemote: Effect.Effect<void>;
}

export type RpcTransportEvent =
  | { readonly _tag: 'HeartbeatSent' | 'HeartbeatReceived' }
  | { readonly _tag: 'HeartbeatTimedOut' }
  | { readonly _tag: 'CloseReceived' };

export interface RpcTransportOptions {
  readonly heartbeatInterval: Duration.Input;
  readonly heartbeatTimeout: Duration.Input;
}

const clientDestination = 0;
const serverDestination = 1;
const controlDestination = 2;
const ping = 0;
const pong = 1;
const close = 2;
const closeAcknowledged = 3;

const frame = (
  destination: typeof clientDestination | typeof serverDestination,
  payload: string | Uint8Array,
) => {
  const bytes =
    typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const output = new Uint8Array(bytes.length + 1);
  output[0] = destination;
  output.set(bytes, 1);
  return output;
};

const outcomeOf = (exit: RpcMessage.ExitEncoded<unknown, unknown>) => {
  if (exit._tag === 'Success') return Activation.completed();
  return exit.cause.every(({ _tag }) => _tag === 'Interrupt')
    ? Activation.interrupted('RPC interrupted')
    : Activation.failed('RPC failed');
};

const toClientError = (cause: unknown) =>
  new RpcClientError.RpcClientError({
    reason: new RpcClientError.RpcClientDefect({
      message: 'WebRTC RPC transport failed',
      cause,
    }),
  });

const makeProtocols = Effect.fn('RpcTransport.makeProtocols')(function* (
  channel: RtcDataChannel,
  peer: RpcPeerContext,
  options: RpcTransportOptions = {
    heartbeatInterval: '5 seconds',
    heartbeatTimeout: '10 seconds',
  },
) {
  const serialization = yield* RpcSerialization.RpcSerialization;
  const encodeClient = serialization.makeUnsafe();
  const encodeServer = serialization.makeUnsafe();
  const decodeClient = serialization.makeUnsafe();
  const decodeServer = serialization.makeUnsafe();
  const disconnects = yield* Queue.unbounded<number>();
  const clientHandlers = new Map<
    number,
    (message: RpcMessage.FromServerEncoded) => Effect.Effect<void>
  >();
  const outgoingFlows = new Map<string | number, OutgoingRpcFlow>();
  const incomingFlows = new Map<string | number, IncomingRpcFlow>();
  const events = yield* PubSub.unbounded<RpcTransportEvent>();
  const closeAck = yield* Deferred.make<void>();
  let awaitingHeartbeatSince: number | undefined;
  let serverHandler:
    | ((
        clientId: number,
        message: RpcMessage.FromClientEncoded,
      ) => Effect.Effect<void>)
    | undefined;

  yield* Effect.addFinalizer(() =>
    Effect.gen(function* () {
      yield* Effect.forEach(outgoingFlows.values(), ({ end }) =>
        end(Activation.interrupted('RTC data channel closed')),
      );
      yield* Effect.forEach(incomingFlows.values(), ({ reply }) =>
        reply(Activation.interrupted('RTC data channel closed')),
      );
    }),
  );

  const sendControl = (message: number) =>
    channel.send(new Uint8Array([controlDestination, message]));

  const heartbeat = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    if (awaitingHeartbeatSince !== undefined) {
      const timeout = Duration.toMillis(
        Duration.fromInputUnsafe(options.heartbeatTimeout),
      );
      if (now - awaitingHeartbeatSince >= timeout) {
        yield* PubSub.publish(events, {
          _tag: 'HeartbeatTimedOut',
        } satisfies RpcTransportEvent);
        return;
      }
    } else {
      awaitingHeartbeatSince = now;
    }
    yield* sendControl(ping);
    yield* PubSub.publish(events, {
      _tag: 'HeartbeatSent',
    } satisfies RpcTransportEvent);
  }).pipe(
    Effect.delay(options.heartbeatInterval),
    Effect.forever,
    Effect.forkScoped({ startImmediately: true }),
  );
  yield* heartbeat;

  const clientProtocol = RpcClient.Protocol.of({
    codecFor: serialization.codecFor,
    supportsAck: true,
    supportsTransferables: false,
    run: (clientId, handler) =>
      Effect.acquireUseRelease(
        Effect.sync(() => clientHandlers.set(clientId, handler)),
        () => Effect.never,
        () => Effect.sync(() => clientHandlers.delete(clientId)),
      ),
    send: (clientId, request) =>
      Effect.gen(function* () {
        let outgoing = request;
        if (request._tag === 'Request') {
          const tracing = yield* startRpcInvocation({
            ...peer,
            rpcTag: request.tag,
          });
          outgoingFlows.set(request.id, tracing);
          outgoing = {
            ...request,
            headers: [...request.headers, ...tracing.headers] as Array<
              [string, string]
            >,
          };
        } else if (request._tag === 'Interrupt') {
          const tracing = outgoingFlows.get(request.requestId);
          if (tracing !== undefined) {
            outgoingFlows.delete(request.requestId);
            yield* tracing.end(Activation.interrupted('RPC interrupted'));
          }
        }
        const encoded = encodeClient.encode(outgoing);
        if (encoded !== undefined) {
          yield* channel.send(frame(clientDestination, encoded));
        }
      }).pipe(Effect.mapError(toClientError)),
  });

  const serverProtocol = RpcServer.Protocol.of({
    codecFor: serialization.codecFor,
    disconnects,
    supportsAck: true,
    supportsTransferables: false,
    supportsSpanPropagation: true,
    supportsNotifications: false,
    initialMessage: Effect.succeed(Option.none()),
    clientIds: Effect.succeed(new Set([0])),
    run: (handler) =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          serverHandler = handler;
        }),
        () => Effect.never,
        () =>
          Effect.sync(() => {
            serverHandler = undefined;
          }),
      ),
    send: (_, response) =>
      Effect.gen(function* () {
        if (response._tag === 'Exit') {
          const tracing = incomingFlows.get(response.requestId);
          if (tracing !== undefined) {
            incomingFlows.delete(response.requestId);
            yield* tracing.reply(outcomeOf(response.exit));
          }
        }
        const encoded = encodeServer.encode(response);
        if (encoded !== undefined) {
          yield* channel.send(frame(serverDestination, encoded));
        }
      }).pipe(Effect.orDie),
    end: () => Effect.void,
  });

  yield* Stream.runForEach(channel.incoming, (input) =>
    Effect.gen(function* () {
      const destination = input[0];
      const payload = input.subarray(1);
      if (destination === controlDestination) {
        const control = input[1];
        if (control === ping) {
          yield* sendControl(pong);
        } else if (control === pong) {
          awaitingHeartbeatSince = undefined;
          yield* PubSub.publish(events, {
            _tag: 'HeartbeatReceived',
          } satisfies RpcTransportEvent);
        } else if (control === close) {
          yield* sendControl(closeAcknowledged);
          yield* PubSub.publish(events, {
            _tag: 'CloseReceived',
          } satisfies RpcTransportEvent);
        } else if (control === closeAcknowledged) {
          yield* Deferred.succeed(closeAck, undefined);
        }
      } else if (destination === clientDestination) {
        const messages = decodeServer.decode(
          payload,
        ) as ReadonlyArray<RpcMessage.FromClientEncoded>;
        for (const message of messages) {
          if (message._tag === 'Request') {
            const tracing = yield* continueRpcInvocation({
              ...peer,
              rpcTag: message.tag,
              headers: message.headers,
            }).pipe(Effect.option);
            if (Option.isSome(tracing)) {
              incomingFlows.set(message.id, tracing.value);
            }
          } else if (message._tag === 'Interrupt') {
            const tracing = incomingFlows.get(message.requestId);
            if (tracing !== undefined) {
              incomingFlows.delete(message.requestId);
              yield* tracing.reply(Activation.interrupted('RPC interrupted'));
            }
          }
          if (serverHandler !== undefined) yield* serverHandler(0, message);
        }
      } else if (destination === serverDestination) {
        const messages = decodeClient.decode(
          payload,
        ) as ReadonlyArray<RpcMessage.FromServerEncoded>;
        for (const message of messages) {
          if (message._tag === 'Exit') {
            const tracing = outgoingFlows.get(message.requestId);
            if (tracing !== undefined) {
              outgoingFlows.delete(message.requestId);
              yield* tracing.end(outcomeOf(message.exit));
            }
          }
          for (const handler of clientHandlers.values())
            yield* handler(message);
        }
      }
    }).pipe(Effect.orDie),
  ).pipe(Effect.forkScoped({ startImmediately: true }));

  const closeRemote = sendControl(close).pipe(
    Effect.andThen(Deferred.await(closeAck)),
    Effect.timeout('1 second'),
    Effect.ignore,
  );

  return {
    clientProtocol,
    serverProtocol,
    events: Stream.fromPubSub(events),
    closeRemote,
  };
});

/** Opens the package-owned RPC Transport for one RTC Data Channel. */
export const make = (
  peer: RpcPeerContext,
  channel: RtcDataChannel,
  options?: RpcTransportOptions,
): Effect.Effect<RpcTransport, RpcTransportError, Scope> =>
  makeProtocols(channel, peer, options).pipe(
    Effect.provide(RpcSerialization.layerJson),
    Effect.map(({ clientProtocol, closeRemote, events, serverProtocol }) => {
      const consume = <Remote extends Rpc.Any>(
        remote: RpcGroup.RpcGroup<Remote>,
      ) =>
        Effect.gen(function* () {
          const client = yield* RpcClient.make(remote).pipe(
            Effect.provideService(RpcClient.Protocol, clientProtocol),
          );
          return { client } satisfies RpcBinding<Remote>;
        }).pipe(
          Effect.provide(RpcSerialization.layerJson),
          Effect.mapError(
            (cause) => new RpcTransportError({ operation: 'consume', cause }),
          ),
        );

      const serve = <Local extends Rpc.Any, E, R>(
        local: RpcGroup.RpcGroup<Local>,
        handlers: Layer.Layer<Rpc.ToHandler<Local>, E, R>,
      ) =>
        Effect.gen(function* () {
          yield* RpcServer.make(local).pipe(
            Effect.provideService(RpcServer.Protocol, serverProtocol),
            Effect.provide(handlers),
            Effect.forkScoped({ startImmediately: true }),
          );
          yield* Effect.yieldNow;
        }).pipe(
          Effect.provide(RpcSerialization.layerJson),
          Effect.mapError(
            (cause) => new RpcTransportError({ operation: 'serve', cause }),
          ),
        );

      return { consume, serve, events, closeRemote };
    }),
    Effect.mapError(
      (cause) => new RpcTransportError({ operation: 'open', cause }),
    ),
  );
