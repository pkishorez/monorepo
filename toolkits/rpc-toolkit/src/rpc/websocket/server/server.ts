import type * as cf from '@cloudflare/workers-types';
import * as Context from 'effect/Context';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as HttpServerRequest from 'effect/http/HttpServerRequest';
import * as HttpServerResponse from 'effect/http/HttpServerResponse';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Option from 'effect/Option';
import * as Queue from 'effect/Queue';
import * as Schema from 'effect/Schema';
import * as RpcSchema from 'effect/rpc/RpcSchema';
import {
  RpcSerialization,
  RpcServer,
  Rpc,
  RpcMessage,
  type RpcGroup,
} from 'effect/rpc';
import {
  makeStreamCheckpoint,
  type StreamCheckpointService,
} from './checkpoint.ts';
import { fromDurableObjectState as fromState } from './durable-object-state.ts';
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
} from './durable-object-state.ts';

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

/**
 * Why a call is executing: `fresh` when a client sent it, `replay` when the
 * server restarts a saved streaming call after waking from hibernation.
 * Server-controlled; clients cannot select replay through request data.
 */
export const InvocationKind = Context.Reference<'fresh' | 'replay'>(
  '@kstackz/rpc-toolkit/InvocationKind',
  { defaultValue: () => 'fresh' },
);

const nextClientId = (used: ReadonlySet<number>): number => {
  const values = new Uint32Array(1);
  let candidate: number;
  do {
    crypto.getRandomValues(values);
    candidate = values[0] ?? 0;
  } while (used.has(candidate));
  return candidate;
};

const serve = Effect.fnUntraced(function* <
  Rpcs extends Rpc.Any,
  E,
  R = never,
  A = never,
>(options: {
  /** The Durable Object's socket registry: alchemy's `DurableObjectState` service, or {@link fromDurableObjectState}'s `state`. */
  readonly state: HibernationState<R>;
  /** Performs the 101 upgrade: alchemy's `Cloudflare.upgrade`, or {@link fromDurableObjectState}'s `upgrade`. */
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

    // The RPC server decodes the envelope in place, so it gets a copy and
    // `request` stays encoded for the attachment and later replays.
    let effect = Effect.provideService(
      receive(attachment.clientId, { ...request }),
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

    if (Option.isNone(findHandler(attachment, request.id))) {
      saveAttachment(
        socket,
        putHandler(attachment, new PersistedHandler({ request })),
      );
    }

    return Effect.provideService(
      effect,
      CheckpointStorage,
      makeStreamCheckpoint({
        get: () =>
          Option.flatMap(
            findHandler(readAttachment(socket), request.id),
            (handler) =>
              Object.hasOwn(handler, 'state')
                ? Option.some(handler.state)
                : Option.none(),
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
    supportsNotifications: true,
    codecFor: serialization.codecFor,
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
        yield* Effect.promise(() => restored);
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

/**
 * Inside a streaming handler: this stream's checkpoint, bound to one schema
 * for both reads and writes, which survives hibernation.
 */
export const checkpoint = <S extends Schema.Top>(schema: S) =>
  Effect.map(CheckpointStorage, (storage) => ({
    get: () => storage.get(schema),
    put: (value: S['Type']) => storage.put(value, schema),
    clear: storage.clear,
  }));

/**
 * Builds the `state` and `upgrade` a server needs from a raw workerd
 * `DurableObjectState`, for callers not using alchemy.
 */
export const fromDurableObjectState = (state: cf.DurableObjectState) =>
  fromState(state);

/**
 * Serves `group` from `handlers` (its handlers and server middleware) over a
 * Durable Object's hibernatable WebSockets, with JSON serialization (the
 * protocol the websocket client speaks). Returns the Durable Object's
 * `accept` (fetch), `message` and `close` callbacks.
 *
 * On wake, every saved streaming call is replayed through server middleware
 * with {@link InvocationKind} set to `replay`.
 */
export const server = <Rpcs extends Rpc.Any, E, R = never, A = never>(
  group: RpcGroup.RpcGroup<Rpcs>,
  handlers: Layer.Layer<
    Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.ServicesServer<Rpcs>,
    E,
    never
  >,
  options: {
    readonly state: HibernationState<R>;
    readonly upgrade: Upgrade<R>;
    readonly connection?: ConnectionSlot<A> | undefined;
  },
) =>
  serve<Rpcs, E, R, A>({ ...options, group, layer: handlers }).pipe(
    Effect.provide(RpcSerialization.layerJson),
  );

export type {
  HibernatingSocket,
  HibernationState,
  Upgrade,
} from './durable-object-state.ts';
