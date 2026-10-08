import { Effect, Fiber, Layer, Schema, Stream } from 'effect';
import { Headers, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { Rpc as EffectRpc, RpcClient, RpcGroup } from 'effect/rpc';
import { expect, it, vi } from 'vitest';
import { Rpc } from '../rpc/index.ts';

it('connects the socket client to the hibernating server and refreshes Middleware credentials on reconnect', async () => {
  vi.stubGlobal('WebSocketRequestResponsePair', class {});
  const Access = Rpc.middleware<boolean>()('wire/Access', { client: true });
  const Group = Access.with(true)(
    RpcGroup.make(
      EffectRpc.make('watch', { success: Schema.Number, stream: true }),
    ),
  );
  let token = 'first';
  let starts = 0;
  const calls: Array<{ token: string | undefined; kind: string }> = [];
  const sockets: TestWebSocket[] = [];
  const errors: unknown[] = [];
  const server = await Effect.runPromise(
    Rpc.websocket.server(
      Group,
      Layer.merge(
        Access.layer(({ headers }) =>
          Effect.gen(function* () {
            calls.push({
              token: headers.authorization,
              kind: yield* Rpc.websocket.InvocationKind,
            });
          }),
        ),
        Group.toLayer({
          watch: () =>
            Stream.unwrap(
              Effect.gen(function* () {
                const checkpoint = yield* Rpc.websocket.checkpoint(
                  Schema.Number,
                );
                yield* checkpoint.put(++starts).pipe(Effect.orDie);
                return Stream.make(starts).pipe(Stream.concat(Stream.never));
              }),
            ),
        }),
      ),
      {
        state: {
          getWebSockets: () => Effect.succeed([]),
          setWebSocketAutoResponse: () => Effect.void,
        },
        upgrade: () =>
          Effect.succeed([
            HttpServerResponse.empty(),
            sockets.at(-1)!.port,
          ] as const),
      },
    ),
  );

  class TestWebSocket extends EventTarget {
    readyState = 1;
    attachment: unknown = null;
    readonly port: Rpc.HibernatingSocket;
    readonly accepted: Promise<unknown>;
    constructor() {
      super();
      sockets.push(this);
      this.port = {
        ws: {
          send: (data: string) =>
            this.dispatchEvent(new MessageEvent('message', { data })),
          close: () => this.close(),
        } as unknown as Rpc.HibernatingSocket['ws'],
        close: () => Effect.sync(() => this.close()),
        serializeAttachment: (value) => {
          this.attachment = structuredClone(value);
        },
        deserializeAttachment: <T>() => this.attachment as T | null,
      };
      // The Durable Object's fetch: upgrade and write the socket's record.
      this.accepted = Effect.runPromise(
        server.accept.pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            HttpServerRequest.fromWeb(new Request('https://test/rpc')),
          ),
        ),
      );
    }
    send(data: string | Uint8Array) {
      void this.accepted
        .then(() =>
          Effect.runPromise(
            server.message(
              this.port,
              typeof data === 'string' ? data : new TextDecoder().decode(data),
            ),
          ),
        )
        .catch((error) => errors.push(error));
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
      yield* Rpc.websocket
        .keepSubscribed(() => client.watch())
        .pipe(
          Stream.runForEach((value) =>
            Effect.sync(() => {
              values.push(value);
            }),
          ),
        );
    }).pipe(
      Effect.provide(
        Layer.merge(
          Rpc.websocket.client(Group, { url: 'ws://test/rpc' }),
          Access.client(({ request, next }) =>
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
