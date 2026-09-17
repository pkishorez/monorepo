import { Effect } from 'effect';
import { HttpServerResponse } from 'effect/unstable/http';
import { RpcSerialization } from 'effect/unstable/rpc';
import {
  makeHibernatingWebSocketRpc,
  type HibernatingSocket,
} from 'rpc-toolkit/rpc/cloudflare/hibernating-rpc';
import { afterEach, expect, it, vi } from 'vitest';
import { DurableSignalingRpcs } from '../src/signaling/durable/rpc/index.js';
import {
  durableSignalingConnection,
  durableSignalingHandlers,
} from '../src/signaling/durable/worker/index.js';

function socket(seed: unknown) {
  let attachment = structuredClone(seed);
  const sent: string[] = [];
  const port: HibernatingSocket = {
    ws: {
      send: (data: string) => sent.push(data),
      close: () => undefined,
    } as unknown as HibernatingSocket['ws'],
    close: () => Effect.void,
    serializeAttachment: (value) => {
      attachment = structuredClone(value);
    },
    deserializeAttachment: <A>() => attachment as A,
  };
  return { port, sent, snapshot: () => structuredClone(attachment) };
}

afterEach(() => vi.unstubAllGlobals());

it('replays the peer subscription after a hibernation wake', async () => {
  vi.stubGlobal('WebSocketRequestResponsePair', class {});
  const connection = {
    userId: 'user-1',
    peerId: crypto.randomUUID(),
    name: 'Laptop',
    mode: 'Connectable' as const,
    connectionId: crypto.randomUUID(),
  };
  const boot = (target: ReturnType<typeof socket>) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const layer = yield* durableSignalingHandlers;
        return yield* makeHibernatingWebSocketRpc({
          group: DurableSignalingRpcs,
          layer,
          state: {
            getWebSockets: () => Effect.succeed([target.port]),
            setWebSocketAutoResponse: () => Effect.void,
          },
          upgrade: () =>
            Effect.succeed([HttpServerResponse.empty(), target.port] as const),
          connection: durableSignalingConnection(
            { authWorkerUrl: '', trustedOrigins: [] },
            {} as never,
          ),
        });
      }).pipe(Effect.provide(RpcSerialization.layerJson)),
    );

  const first = socket({ clientId: 1, handlers: [], connection });
  const firstServer = await boot(first);
  await Effect.runPromise(
    firstServer.message(
      first.port,
      JSON.stringify({
        _tag: 'Request',
        id: 'directory',
        tag: 'SubscribePeers',
        payload: null,
        headers: [],
      }),
    ),
  );
  await vi.waitFor(() =>
    expect(first.snapshot()).toMatchObject({
      handlers: [{ request: { tag: 'SubscribePeers' } }],
    }),
  );

  const resumed = socket(first.snapshot());
  const resumedServer = await boot(resumed);
  await vi.waitFor(() => expect(resumed.sent.join('')).toContain('directory'));

  await Effect.runPromise(firstServer.close(first.port, 1000, 'done'));
  await Effect.runPromise(resumedServer.close(resumed.port, 1000, 'done'));
});
