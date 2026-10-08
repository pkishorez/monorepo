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
  forgetfulCheckpoint,
  makeStreamCheckpoint,
  type StreamCheckpointService,
} from './checkpoint.ts';
import { fromDurableObjectState as fromState } from './durable-object-state.ts';
import * as streams from './stream-store/index.ts';
import type { SavedStream, StreamStore } from './stream-store/index.ts';
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

/** Close code for a socket whose saved record is gone; the client reconnects and resubscribes. */
export const RESUME_LOST = 4000;

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
  readonly streams?: StreamStore | undefined;
}) {
  const { state, upgrade, group, layer, connection } = options;
  const store = options.streams ?? streams.attachment();
  const serialization = yield* RpcSerialization.RpcSerialization;
  const sockets = new Map<number, HibernatingSocket>();
  const clientIds = new WeakMap<cf.WebSocket, number>();
  const connections = new Map<number, Option.Option<A>>();
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

  /** The stored connection value, or `None` — in which case the tag's default applies. */
  const connectionValue = (stored: unknown): Option.Option<A> => {
    if (stored === undefined) return Option.none();
    return decodeConnection
      ? decodeConnection(stored)
      : Option.some(stored as A);
  };

  const register = (
    socket: HibernatingSocket,
    clientId: number,
    stored: unknown,
  ) => {
    sockets.set(clientId, socket);
    clientIds.set(socket.ws, clientId);
    connections.set(clientId, connectionValue(stored));
  };

  const unregister = (clientId: number) => {
    sockets.delete(clientId);
    connections.delete(clientId);
  };

  /** A live socket with no record cannot resume: close it so the client resubscribes. */
  const resumeLost = (socket: HibernatingSocket) =>
    socket.close(RESUME_LOST, 'resume lost');

  // Boot: every live socket must still have its record; the rest are closed.
  const saved: Array<readonly [HibernatingSocket, ReadonlyArray<SavedStream>]> =
    [];
  for (const socket of yield* state.getWebSockets()) {
    const record = yield* store.load(socket);
    if (Option.isNone(record) || sockets.has(record.value.clientId)) {
      yield* resumeLost(socket);
      continue;
    }
    register(socket, record.value.clientId, record.value.connection);
    saved.push([socket, record.value.streams]);
  }
  // Catches closes that were never delivered, e.g. during a deploy.
  yield* store.reconcile(new Set(sockets.keys()));

  const disconnects = yield* Queue.unbounded<number>();
  const ready = yield* Deferred.make<void>();
  let receive: (
    clientId: number,
    message: RpcMessage.FromClientEncoded,
  ) => Effect.Effect<void> = () => Effect.void;

  const dispatch = (
    socket: HibernatingSocket,
    clientId: number,
    request: RpcMessage.FromClientEncoded,
    kind: 'fresh' | 'replay' = 'fresh',
  ) =>
    Effect.gen(function* () {
      const rpc =
        request._tag === 'Request'
          ? group.requests.get(request.tag)
          : undefined;

      // The RPC server decodes the envelope in place, so it gets a copy and
      // `request` stays encoded for the store and later replays.
      let effect = Effect.provideService(
        receive(clientId, { ...request }),
        InvocationKind,
        kind,
      );

      const value = connections.get(clientId);
      if (connection !== undefined && value && Option.isSome(value)) {
        effect = Effect.provideService(effect, connection.tag, value.value);
      }

      if (
        request._tag !== 'Request' ||
        !Rpc.isRpc(rpc) ||
        !RpcSchema.isStreamSchema(rpc.successSchema)
      ) {
        return yield* effect;
      }

      yield* store.start(socket, clientId, request);

      return yield* Effect.provideService(
        effect,
        CheckpointStorage,
        makeStreamCheckpoint({
          get: store.getCheckpoint(socket, clientId, request.id),
          put: (checkpoint) =>
            store.putCheckpoint(socket, clientId, request.id, checkpoint),
          // Today a cleared checkpoint also means "do not replay this stream".
          clear: store.end(socket, clientId, request.id),
        }),
      );
    });

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
      Effect.gen(function* () {
        const socket = sockets.get(clientId);
        if (!socket) return;
        if (response._tag === 'Exit') {
          yield* store.end(socket, clientId, response.requestId);
        }
        const encoded = parserFor(socket).encode(response);
        if (encoded !== undefined) socket.ws.send(encoded);
      }),
    end: (clientId) =>
      Effect.sync(() => {
        const socket = sockets.get(clientId);
        unregister(clientId);
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
        Effect.forEach(
          saved,
          ([socket, streams]) => {
            const clientId = clientIds.get(socket.ws);
            if (clientId === undefined || sockets.get(clientId) !== socket)
              return Effect.void;
            return Effect.forEach(
              streams,
              ({ request }) =>
                dispatch(
                  socket,
                  clientId,
                  request as RpcMessage.FromClientEncoded,
                  'replay',
                ),
              { discard: true },
            );
          },
          { discard: true },
        ),
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
      const clientId = nextClientId(new Set(sockets.keys()));
      // The record is written before the 101 goes back, so it exists before
      // any message from this socket is processed.
      yield* store.connect(socket, clientId, encoded);
      register(socket, clientId, encoded);
      return response;
    }).pipe(
      Effect.catch((rejection: HttpServerResponse.HttpServerResponse) =>
        Effect.succeed(rejection),
      ),
    ),
    message: (socket: HibernatingSocket, data: string | ArrayBuffer) =>
      Effect.promise(async () => {
        await restored;
        const clientId = clientIds.get(socket.ws);
        if (clientId === undefined || sockets.get(clientId) !== socket) {
          await runtime.runPromise(resumeLost(socket));
          return;
        }
        const bytes = typeof data === 'string' ? data : new Uint8Array(data);
        const messages = parserFor(socket).decode(bytes);

        await runtime.runPromise(
          Effect.forEach(
            messages,
            (message) => {
              const request = message as RpcMessage.FromClientEncoded;
              return request._tag === 'Interrupt'
                ? store
                    .end(socket, clientId, request.requestId)
                    .pipe(Effect.andThen(dispatch(socket, clientId, request)))
                : dispatch(socket, clientId, request);
            },
            { discard: true },
          ),
        );
      }),
    close: (socket: HibernatingSocket, code: number, reason: string) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => restored);
        const clientId = clientIds.get(socket.ws);
        if (clientId !== undefined && sockets.get(clientId) === socket) {
          unregister(clientId);
          yield* store.forget(socket, clientId);
          yield* Queue.offer(disconnects, clientId);
        }
        yield* socket.close(code, reason);
      }),
  };
});

const CheckpointStorage = Context.Reference<StreamCheckpointService>(
  // Retain the established service identity across the package migration.
  '@pkishorez/effect-cloudflare/StreamCheckpoint',
  // Outside a WebSocket-server stream (in-process, http) nothing hibernates,
  // so the checkpoint simply remembers nothing.
  { defaultValue: () => forgetfulCheckpoint },
);

/**
 * Inside a streaming handler: this stream's checkpoint, bound to one schema
 * for both reads and writes, which survives hibernation. Outside a
 * WebSocket-server stream it remembers nothing: `get` finds `None` and
 * `put`/`clear` do nothing.
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
 * with {@link InvocationKind} set to `replay`. `streams` chooses where that
 * state lives (default: the socket attachment, `streams.attachment()`).
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
    /** Where each socket's record and open streams are kept. @default streams.attachment() */
    readonly streams?: StreamStore | undefined;
  },
) =>
  serve<Rpcs, E, R, A>({ ...options, group, layer: handlers }).pipe(
    Effect.provide(RpcSerialization.layerJson),
  );

/**
 * Stream Stores for the server's `streams` option: `attachment()` (the
 * default) or `sqlite({ storage })` on the Durable Object's own SQLite.
 */
export * as streams from './stream-store/index.ts';
export type {
  SavedSocket,
  SavedStream,
  StreamRequest,
  StreamStore,
} from './stream-store/index.ts';
export type {
  HibernatingSocket,
  HibernationState,
  Upgrade,
} from './durable-object-state.ts';
