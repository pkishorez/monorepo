import type * as cf from '@cloudflare/workers-types';
import * as Context from 'effect/Context';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Option from 'effect/Option';
import * as Queue from 'effect/Queue';
import * as Schema from 'effect/Schema';
import * as RpcSchema from 'effect/unstable/rpc/RpcSchema';
import {
  RpcSerialization,
  RpcServer,
  Rpc,
  RpcMessage,
  type RpcGroup,
} from 'effect/unstable/rpc';
import {
  makeStreamCheckpoint,
  type StreamCheckpointService,
} from './checkpoint.ts';
import { InvocationKind } from '../../invocation/index.js';
import { fromDurableObjectState as makePlatform } from './platform.ts';
import {
  ConnectionAttachment,
  decodeConnectionAttachment,
  findHandler,
  PersistedHandler,
  putHandler,
  removeHandler,
} from './attachment.ts';
import type {
  HibernatingSocket,
  HibernationState,
  Upgrade,
} from './platform.ts';

/**
 * Per-connection state: computed once from the upgrade request, persisted on
 * the socket, and provided to every handler on every wake.
 */
export interface ConnectionSlot<A> {
  /** Your own `Context.Reference`. Its `defaultValue` is used when no value is stored. */
  readonly tag: Context.Reference<A>;
  /**
   * Runs *before* the WebSocket upgrade. Failing with an `HttpServerResponse`
   * rejects the connection and returns that response instead of a 101.
   */
  readonly initial: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<A, HttpServerResponse.HttpServerResponse>;
  /**
   * Optional. Attachments outlive deploys, so a schema turns a shape change
   * into a clean decode miss (falling back to the tag's default) instead of
   * undefined behaviour. Omit it for plain structured-cloneable data.
   */
  readonly schema?: Schema.Codec<A, unknown> | undefined;
}

const nextClientId = (used: ReadonlySet<number>): number => {
  const values = new Uint32Array(1);
  let candidate: number;
  do {
    crypto.getRandomValues(values);
    candidate = values[0] ?? 0;
  } while (used.has(candidate));
  return candidate;
};

export const makeHibernatingWebSocketRpc = Effect.fnUntraced(function* <
  Rpcs extends Rpc.Any,
  E,
  R = never,
  A = never,
>(options: {
  /** The Durable Object's socket registry — alchemy's `DurableObjectState` service, or {@link fromDurableObjectState}'s `state`. */
  readonly state: HibernationState<R>;
  /** Performs the 101 upgrade — alchemy's `Cloudflare.upgrade`, or {@link fromDurableObjectState}'s `upgrade`. */
  readonly upgrade: Upgrade<R>;
  readonly group: RpcGroup.RpcGroup<Rpcs>;
  readonly layer: Layer.Layer<
    Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.ServicesServer<Rpcs>,
    E,
    never
  >;
  readonly connection?: ConnectionSlot<A> | undefined;
}) {
  const { state, upgrade, group, layer, connection } = options;
  const serialization = yield* RpcSerialization.RpcSerialization;
  const sockets = new Map<number, HibernatingSocket>();
  const clientIds = new WeakMap<cf.WebSocket, number>();
  const parsers = new WeakMap<cf.WebSocket, RpcSerialization.Parser>();

  const decodeConnection = connection?.schema
    ? Schema.decodeUnknownOption(connection.schema)
    : undefined;

  const parserFor = (socket: HibernatingSocket) => {
    const existing = parsers.get(socket.ws);
    if (existing) return existing;
    const parser = serialization.makeUnsafe();
    parsers.set(socket.ws, parser);
    return parser;
  };

  const autoResponseParser = serialization.makeUnsafe();
  const ping = autoResponseParser.encode(RpcMessage.constPing);
  const pong = autoResponseParser.encode(RpcMessage.constPong);
  if (typeof ping === 'string' && typeof pong === 'string') {
    const Pair = (
      globalThis as typeof globalThis & {
        WebSocketRequestResponsePair: new (
          request: string,
          response: string,
        ) => cf.WebSocketRequestResponsePair;
      }
    ).WebSocketRequestResponsePair;
    yield* state.setWebSocketAutoResponse(new Pair(ping, pong));
  } else {
    yield* state.setWebSocketAutoResponse();
  }

  const saveAttachment = (
    socket: HibernatingSocket,
    attachment: ConnectionAttachment,
  ) => {
    socket.serializeAttachment(attachment);
    sockets.set(attachment.clientId, socket);
    clientIds.set(socket.ws, attachment.clientId);
    return attachment;
  };

  const readAttachment = (socket: HibernatingSocket) => {
    const knownClientId = clientIds.get(socket.ws);
    const decoded = decodeConnectionAttachment(
      socket.deserializeAttachment<unknown>(),
      knownClientId ?? nextClientId(new Set(sockets.keys())),
    );
    return saveAttachment(
      socket,
      knownClientId === undefined || decoded.clientId === knownClientId
        ? decoded
        : new ConnectionAttachment({ ...decoded, clientId: knownClientId }),
    );
  };

  /** The stored connection value, or `None` — in which case the tag's default applies. */
  const connectionValue = (
    attachment: ConnectionAttachment,
  ): Option.Option<A> => {
    const stored = attachment.connection;
    if (stored === undefined) return Option.none();
    return decodeConnection
      ? decodeConnection(stored)
      : Option.some(stored as A);
  };

  for (const socket of yield* state.getWebSockets()) {
    const decoded = decodeConnectionAttachment(
      socket.deserializeAttachment<unknown>(),
      nextClientId(new Set(sockets.keys())),
    );
    saveAttachment(
      socket,
      sockets.has(decoded.clientId)
        ? new ConnectionAttachment({
            ...decoded,
            clientId: nextClientId(new Set(sockets.keys())),
          })
        : decoded,
    );
  }

  const disconnects = yield* Queue.unbounded<number>();
  const ready = yield* Deferred.make<void>();
  let receive: (
    clientId: number,
    message: RpcMessage.FromClientEncoded,
  ) => Effect.Effect<void> = () => Effect.void;

  const dispatch = (
    socket: HibernatingSocket,
    request: RpcMessage.FromClientEncoded,
    kind: 'fresh' | 'replay' = 'fresh',
  ) => {
    const attachment = readAttachment(socket);
    const rpc =
      request._tag === 'Request' ? group.requests.get(request.tag) : undefined;

    let effect = Effect.provideService(
      receive(attachment.clientId, request),
      InvocationKind,
      kind,
    );

    if (connection !== undefined) {
      const value = connectionValue(attachment);
      if (Option.isSome(value)) {
        effect = Effect.provideService(effect, connection.tag, value.value);
      }
    }

    if (
      request._tag !== 'Request' ||
      !Rpc.isRpc(rpc) ||
      !RpcSchema.isStreamSchema(rpc.successSchema)
    ) {
      return effect;
    }

    return Effect.provideService(
      effect,
      CheckpointStorage,
      makeStreamCheckpoint({
        get: () =>
          Option.map(
            findHandler(readAttachment(socket), request.id),
            ({ state }) => state,
          ),
        put: (state) =>
          saveAttachment(
            socket,
            putHandler(
              readAttachment(socket),
              new PersistedHandler({ request, state }),
            ),
          ),
        clear: () =>
          saveAttachment(
            socket,
            removeHandler(readAttachment(socket), request.id),
          ),
      }),
    );
  };

  const protocol: RpcServer.Protocol['Service'] = {
    run: (handler) =>
      Effect.sync(() => {
        receive = handler;
      }).pipe(
        Effect.andThen(Deferred.succeed(ready, undefined)),
        Effect.andThen(Effect.never),
      ),
    disconnects,
    send: (clientId, response) =>
      Effect.sync(() => {
        const socket = sockets.get(clientId);
        if (socket && response._tag === 'Exit') {
          saveAttachment(
            socket,
            removeHandler(readAttachment(socket), response.requestId),
          );
        }
        const encoded = socket && parserFor(socket).encode(response);
        if (socket && encoded !== undefined) socket.ws.send(encoded);
      }),
    end: (clientId) =>
      Effect.sync(() => {
        const socket = sockets.get(clientId);
        sockets.delete(clientId);
        socket?.ws.close(1000, 'RPC session ended');
      }),
    clientIds: Effect.sync(() => new Set(sockets.keys())),
    initialMessage: Effect.succeed(Option.none()),
    supportsAck: false,
    supportsTransferables: false,
    supportsSpanPropagation: true,
  };

  const runtime = ManagedRuntime.make(
    Layer.mergeAll(layer, Layer.succeed(RpcServer.Protocol, protocol)),
  );
  runtime.runFork(RpcServer.make(group));

  const restored = runtime.runPromise(
    Deferred.await(ready).pipe(
      Effect.andThen(
        Effect.forEach(sockets, ([, socket]) => {
          const { handlers } = readAttachment(socket);
          return Effect.forEach(
            handlers,
            ({ request }) => dispatch(socket, request, 'replay'),
            {
              discard: true,
            },
          );
        }),
      ),
    ),
  );

  return {
    accept: Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;

      // Resolve the connection value *before* upgrading, so a rejection can
      // still be answered with a real HTTP response.
      const encoded =
        connection === undefined
          ? undefined
          : yield* connection
              .initial(request)
              .pipe(
                Effect.flatMap((value) =>
                  connection.schema
                    ? Schema.encodeUnknownEffect(connection.schema)(value).pipe(
                        Effect.orDie,
                      )
                    : Effect.succeed(value as unknown),
                ),
              );

      const [response, socket] = yield* upgrade();
      const attachment = readAttachment(socket);
      saveAttachment(
        socket,
        encoded === undefined
          ? attachment
          : new ConnectionAttachment({ ...attachment, connection: encoded }),
      );
      return response;
    }).pipe(
      Effect.catch((rejection: HttpServerResponse.HttpServerResponse) =>
        Effect.succeed(rejection),
      ),
    ),
    message: (socket: HibernatingSocket, data: string | ArrayBuffer) =>
      Effect.promise(async () => {
        await restored;
        let attachment = readAttachment(socket);
        const bytes = typeof data === 'string' ? data : new Uint8Array(data);
        const messages = parserFor(socket).decode(bytes);

        await runtime.runPromise(
          Effect.forEach(
            messages,
            (message) => {
              const request = message as RpcMessage.FromClientEncoded;
              if (request._tag === 'Interrupt') {
                attachment = removeHandler(attachment, request.requestId);
                saveAttachment(socket, attachment);
              }
              return dispatch(socket, request);
            },
            { discard: true },
          ),
        );
      }),
    close: (socket: HibernatingSocket, code: number, reason: string) =>
      Effect.gen(function* () {
        const attachment = readAttachment(socket);
        sockets.delete(attachment.clientId);
        yield* Queue.offer(disconnects, attachment.clientId);
        yield* socket.close(code, reason);
      }),
  };
});

const unavailable = Effect.die(
  'StreamCheckpoint is only available inside streaming RPC handlers',
);

const CheckpointStorage = Context.Reference<StreamCheckpointService>(
  // Retain the established service identity across the package migration.
  '@pkishorez/effect-cloudflare/StreamCheckpoint',
  {
    defaultValue: () => ({
      get: () => unavailable,
      put: () => unavailable,
      clear: unavailable,
    }),
  },
);

/** Bind one schema to this stream's checkpoint for both reads and writes. */
export const StreamCheckpoint = <S extends Schema.Top>(schema: S) =>
  Effect.map(CheckpointStorage, (storage) => ({
    get: () => storage.get(schema),
    put: (value: S['Type']) => storage.put(value, schema),
    clear: storage.clear,
  }));

export const fromDurableObjectState = (state: cf.DurableObjectState) =>
  makePlatform(state);
export type {
  HibernatingSocket,
  HibernationState,
  Upgrade,
} from './platform.ts';
