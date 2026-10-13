import type * as cf from '@cloudflare/workers-types';
import { Effect, Layer, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expect, it } from 'vitest';
import { Authz, type Resolution } from '@kstackz/auth-toolkit/guard';
import { Api } from '../../../define/index.ts';
import { forOwner, liveObject, ownedBy } from '../live.ts';

const Group = RpcGroup.make(Rpc.make('Ping', { success: Schema.String }));

const signedBy = (id: string): Resolution => ({
  current: {
    kind: 'token',
    user: { id, email: `${id}@example.com`, name: id },
    client: { id: 'app' },
    scopes: [],
  } as unknown as Resolution['current'],
  refreshedCookies: [],
});

// A resolver that finds every request signed by `id`.
const resolving = (id: string) =>
  Layer.succeed(
    Authz.Resolver,
    Authz.Resolver.of({ resolve: () => Effect.succeed(signedBy(id)) }),
  );

const resolve = (layer: ReturnType<typeof resolving>) =>
  Effect.runPromise(
    Authz.Resolver.use((found) =>
      found.resolve(new Request('https://app.test/live')),
    ).pipe(Effect.provide(layer)),
  );

// A Durable Object's state, its storage a map, its sockets none.
const stateWith = (stored: Record<string, string>) => {
  const storage = new Map(Object.entries(stored));
  return {
    storage: {
      get: async (key: string) => storage.get(key),
      put: async (key: string, value: string) => void storage.set(key, value),
    },
    getWebSockets: () => [],
    setWebSocketAutoResponse: () => {},
    acceptWebSocket: () => {},
  } as unknown as cf.DurableObjectState;
};

(globalThis as Record<string, unknown>).WebSocketRequestResponsePair ??= class {
  constructor(
    readonly request: string,
    readonly response: string,
  ) {}
};

const Live = liveObject({
  api: Api.websocket(Group, { path: '/live' }),
  backend: () => Group.toLayer({ Ping: () => Effect.succeed('pong') }),
  auth: { url: 'https://auth.invalid' },
});

describe('a Live Object', () => {
  it("takes calls signed by its owner, and nobody else's", async () => {
    const owner = async () => 'ada';
    expect(
      await resolve(ownedBy(owner).pipe(Layer.provide(resolving('ada')))),
    ).not.toBeNull();
    expect(
      await resolve(ownedBy(owner).pipe(Layer.provide(resolving('mary')))),
    ).toBeNull();
  });

  it('refuses a socket opened for anyone but its owner', async () => {
    const object = new Live(
      stateWith({ '@kstackz/web-platform/live/owner': 'ada' }),
      {},
    );
    const request = new Request('https://app.test/live');
    expect((await object.fetch(forOwner(request, 'mary'))).status).toBe(403);
    // Not forwarded by the server, so owned by nobody named.
    expect((await object.fetch(request)).status).toBe(403);
  });

  it('names the owner itself, whatever the caller sent', () => {
    const request = new Request('https://app.test/live', {
      headers: { 'x-kstack-live-owner': 'mary' },
    });
    expect(forOwner(request, 'ada').headers.get('x-kstack-live-owner')).toBe(
      'ada',
    );
  });
});
