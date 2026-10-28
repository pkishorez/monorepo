import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { RpcGroup } from 'effect/rpc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { client } from './client.ts';

/*
 * What `client` hands the WebSocket constructor: the resolved URL and the
 * protocols offered. A fake WebSocket records each dial and never opens.
 */

const dials: Array<{ url: string; protocols: unknown }> = [];
const sockets: Array<FakeWebSocket> = [];

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly readyState = 0;
  binaryType = 'blob';
  constructor(url: string, protocols?: unknown) {
    super();
    dials.push({ url, protocols });
    sockets.push(this);
  }
  send() {}
  close() {}
}

const original = globalThis.WebSocket;
afterEach(() => {
  globalThis.WebSocket = original;
  dials.length = 0;
  sockets.length = 0;
});

const dial = (options: Parameters<typeof client>[1]) => {
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Layer.build(client(RpcGroup.make(), options));
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(dials.length).toBeGreaterThan(0), {
            timeout: 1_000,
          }),
        );
      }),
    ),
  );
};

describe('client', () => {
  it('offers no protocols unless given some', async () => {
    await dial({ url: 'wss://example.test/rpc' });
    expect(dials[0]).toEqual({
      url: 'wss://example.test/rpc',
      protocols: undefined,
    });
  });

  it('offers the protocols given', async () => {
    await dial({ url: 'wss://example.test/rpc', protocols: ['a', 'b.c'] });
    expect(dials[0]?.protocols).toEqual(['a', 'b.c']);
  });

  it('runs protocols given as an Effect on connect', async () => {
    await dial({
      url: 'wss://example.test/rpc',
      protocols: Effect.succeed(['fresh']),
    });
    expect(dials[0]?.protocols).toEqual(['fresh']);
  });

  it("tells `watch` of a socket's first frame, and how it closed", async () => {
    const told: Array<unknown> = [];
    await dial({
      url: 'wss://example.test/rpc',
      watch: {
        answered: () => told.push('answered'),
        closed: (close) => told.push(close),
      },
    });
    const socket = sockets[0]!;
    socket.dispatchEvent(new MessageEvent('message', { data: '[]' }));
    socket.dispatchEvent(new MessageEvent('message', { data: '[]' }));
    socket.dispatchEvent(
      Object.assign(new Event('close'), { code: 4409, reason: 'why' }),
    );
    expect(told).toEqual(['answered', { code: 4409, reason: 'why' }]);
  });
});
