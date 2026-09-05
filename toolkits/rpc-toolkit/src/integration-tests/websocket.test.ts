import { Effect, Fiber, Layer, Schema, Stream } from 'effect';
import { Headers, HttpServerResponse } from 'effect/unstable/http';
import {
  Rpc,
  RpcClient,
  RpcGroup,
  RpcSerialization,
} from 'effect/unstable/rpc';
import { expect, it, vi } from 'vitest';
import { Cannotation } from '../rpc/cannotation/index.js';
import { InvocationKind } from '../rpc/invocation/index.js';
import {
  layerWebSocketProtocol,
  keepSubscribed,
} from '../rpc/websocket-client/index.js';
import {
  makeHibernatingWebSocketRpc,
  StreamCheckpoint,
  type HibernatingSocket,
} from '../rpc/cloudflare/hibernating-rpc/index.js';

it('connects the socket client to the hibernating server and refreshes Cannotation credentials on reconnect', async () => {
  vi.stubGlobal('WebSocketRequestResponsePair', class {});
  const Access = Cannotation.make<boolean>()('wire/Access', { client: true });
  const Group = Access.with(true)(
    RpcGroup.make(Rpc.make('watch', { success: Schema.Number, stream: true })),
  );
  let token = 'first';
  let starts = 0;
  const calls: Array<{ token: string | undefined; kind: string }> = [];
  const sockets: TestWebSocket[] = [];
  const errors: unknown[] = [];
  const server = await Effect.runPromise(
    makeHibernatingWebSocketRpc({
      group: Group,
      layer: Layer.merge(
        Access.layer(({ headers }) =>
          Effect.gen(function* () {
            calls.push({
              token: headers.authorization,
              kind: yield* InvocationKind,
            });
          }),
        ),
        Group.toLayer({
          watch: () =>
            Stream.unwrap(
              Effect.gen(function* () {
                const checkpoint = yield* StreamCheckpoint(Schema.Number);
                yield* checkpoint.put(++starts).pipe(Effect.orDie);
                return Stream.make(starts).pipe(Stream.concat(Stream.never));
              }),
            ),
        }),
      ),
      state: {
        getWebSockets: () => Effect.succeed([]),
        setWebSocketAutoResponse: () => Effect.void,
      },
      upgrade: () =>
        Effect.succeed([
          HttpServerResponse.empty(),
          sockets.at(-1)!.port,
        ] as const),
    }).pipe(Effect.provide(RpcSerialization.layerJson)),
  );

  class TestWebSocket extends EventTarget {
    readyState = 1;
    attachment: unknown = null;
    readonly port: HibernatingSocket;
    constructor() {
      super();
      sockets.push(this);
      this.port = {
        ws: {
          send: (data: string) =>
            this.dispatchEvent(new MessageEvent('message', { data })),
          close: () => this.close(),
        } as unknown as HibernatingSocket['ws'],
        close: () => Effect.sync(() => this.close()),
        serializeAttachment: (value) => {
          this.attachment = structuredClone(value);
        },
        deserializeAttachment: <T>() => this.attachment as T | null,
      };
    }
    send(data: string | Uint8Array) {
      void Effect.runPromise(
        server.message(
          this.port,
          typeof data === 'string' ? data : new TextDecoder().decode(data),
        ),
      ).catch((error) => errors.push(error));
    }
    close(code = 1000) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.dispatchEvent(
        Object.assign(new Event('close'), { code, reason: 'test disconnect' }),
      );
      void Effect.runPromise(
        server.close(this.port, code, 'test disconnect'),
      ).catch((error) => errors.push(error));
    }
  }
  vi.stubGlobal('WebSocket', TestWebSocket);
  const values: number[] = [];
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(Group);
      yield* keepSubscribed(() => client.watch()).pipe(
        Stream.runForEach((value) =>
          Effect.sync(() => {
            values.push(value);
          }),
        ),
      );
    }).pipe(
      Effect.provide(
        Layer.merge(
          layerWebSocketProtocol({
            url: 'ws://test/rpc',
            serialization: RpcSerialization.layerJson,
          }),
          Access.clientLayer(({ request, next }) =>
            next({
              ...request,
              headers: Headers.fromInput({ authorization: token }),
            }),
          ),
        ),
      ),
      Effect.scoped,
    ),
  );
  try {
    await vi.waitFor(() => expect(values).toEqual([1]));
    token = 'refreshed';
    sockets[0]!.close();
    await vi.waitFor(() => expect(values).toEqual([1, 2]), { timeout: 5000 });
    expect(calls).toEqual([
      { token: 'first', kind: 'fresh' },
      { token: 'refreshed', kind: 'fresh' },
    ]);
    expect(errors).toEqual([]);
  } finally {
    await Effect.runPromise(Fiber.interrupt(fiber));
    for (const socket of sockets) socket.close();
    vi.unstubAllGlobals();
  }
});
