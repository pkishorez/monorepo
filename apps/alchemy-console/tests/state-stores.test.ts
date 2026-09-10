import { Effect, Layer, Schema } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import { FetchHttpClient } from 'effect/unstable/http';
import { Authz } from 'auth-toolkit/rpc';
import { authzLayer } from 'auth-toolkit/rpc/server';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { expect, it } from 'vite-plus/test';
import { appTable } from '../src/server/storage/state-store-database/index.ts';
import {
  alchemyStateStoreEntity as stores,
  alchemyStateStoreSchema,
} from '../src/server/storage/state-store-database/index.ts';
import { StateStores } from '../src/shared/rpc/state-stores/index.ts';
import { createStateStoreInput } from '../src/shared/contracts/state-stores/index.ts';
import { StateStoreHandlers } from '../src/server/handlers/state-store-handlers/index.ts';

const connection = {
  kind: 'cloudflare' as const,
  accountId: 'a'.repeat(32),
  apiToken: 'account-test-token',
  url: 'https://alchemy-state-store.example.workers.dev',
  authToken: 'private-test-token',
};
const discoveryFetch = Object.assign(
  async (input: Parameters<typeof globalThis.fetch>[0]) => {
    const url = new URL(String(input));
    const success = (result: unknown) =>
      Response.json({ success: true, result });
    if (url.hostname !== 'api.cloudflare.com') {
      if (url.pathname === '/state/stacks') return Response.json([]);
      return new Response(connection.authToken);
    }
    if (url.pathname.endsWith('/workers/subdomain'))
      return success({ subdomain: 'example' });
    if (url.pathname.endsWith('/settings')) return success({});
    if (url.pathname.endsWith('/secrets_store/stores'))
      return success([{ id: 'secrets-store' }]);
    if (url.pathname.endsWith('/subdomain/edge-preview'))
      return success({ token: 'upload-token' });
    if (url.pathname.endsWith('/scripts/alchemy-state-store/edge-preview'))
      return success({ preview_token: 'preview-token' });
    throw new Error(`Unexpected discovery request: ${url.pathname}`);
  },
  { preconnect: () => {} },
);
const adminProbes = [
  '/storage/kv/namespaces',
  '/r2/buckets',
  '/d1/database',
  '/queues',
];
const adminFetch = Object.assign(
  async (input: Parameters<typeof globalThis.fetch>[0]) => {
    const url = new URL(String(input));
    if (adminProbes.some((path) => url.pathname.endsWith(path)))
      return Response.json({ success: true, result: [] });
    return discoveryFetch(input);
  },
  { preconnect: () => {} },
);
const headers = (userId: string) => ({ headers: { cookie: userId } });
const resolver = Layer.succeed(Authz.Resolver, {
  resolve: (request) =>
    Effect.sync(() => {
      const id = request.headers.get('cookie');
      if (!id || id === 'invalid') return null;
      const now = new Date();
      return {
        currentAuth: {
          user: {
            id,
            name: id,
            email: `${id}@example.com`,
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          },
          session: {
            id: `session-${id}`,
            userId: id,
            token: 'session-token',
            expiresAt: new Date(Date.now() + 60000),
            createdAt: now,
            updatedAt: now,
          },
        },
        refreshedCookies: [],
      };
    }),
});

const makeClient = () => RpcTest.makeClient(StateStores);

const run = <A, E>(
  use: (
    client: Effect.Success<ReturnType<typeof makeClient>>,
  ) => Effect.Effect<A, E, never>,
  fetch: typeof globalThis.fetch = discoveryFetch,
) => {
  const database = makeNodeSQLite({ path: ':memory:' });
  const table = SQLite.make(appTable, { database });
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* table.setup;
      const client = yield* RpcTest.makeClient(StateStores);
      return yield* use(client);
    }).pipe(
      Effect.scoped,
      Effect.provide(StateStoreHandlers.pipe(Layer.provide(table.layer))),
      Effect.provide(authzLayer.pipe(Layer.provide(resolver))),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: 'manual',
      }),
      Effect.ensuring(Effect.sync(() => database.close?.())),
    ),
  );
};

it('masks all returned tokens, isolates owners, renames, and deletes', async () => {
  await run((client) =>
    Effect.gen(function* () {
      const created = yield* client['AlchemyStateStore.Create'](
        { name: ' My store ', connection },
        headers('alice'),
      );
      expect(created.userId).toBe('alice');
      expect(created.name).toBe('My store');
      expect(created.connection.authToken).toBe('xxxxxxxx');
      expect(created.connection.apiToken).toBe('xxxxxxxx');

      const alice = yield* client['AlchemyStateStore.List'](
        {},
        headers('alice'),
      );
      expect(alice).toEqual([created]);
      expect(JSON.stringify(alice)).not.toContain(connection.authToken);
      expect(
        yield* client['AlchemyStateStore.List']({}, headers('bob')),
      ).toEqual([]);

      for (const method of [
        'AlchemyStateStore.Rename',
        'AlchemyStateStore.Delete',
      ] as const) {
        const error = yield* Effect.flip(
          client[method]({ id: created.id, name: 'Stolen' }, headers('bob')),
        );
        expect(error).toMatchObject({
          _tag: 'StateStoreError',
          code: 'not-found',
        });
      }

      const renamed = yield* client['AlchemyStateStore.Rename'](
        { id: created.id, name: 'Renamed' },
        headers('alice'),
      );
      expect(renamed.name).toBe('Renamed');
      expect(renamed.connection.authToken).toBe('xxxxxxxx');
      yield* client['AlchemyStateStore.Delete'](
        { id: created.id },
        headers('alice'),
      );
      expect(
        yield* client['AlchemyStateStore.List']({}, headers('alice')),
      ).toEqual([]);
      const missing = yield* Effect.flip(
        client['AlchemyStateStore.Rename'](
          { id: created.id, name: 'Missing' },
          headers('alice'),
        ),
      );
      expect(missing).toMatchObject({ code: 'not-found' });
    }),
  );
});

it('requires authentication for every operation', async () => {
  await run((client) =>
    Effect.gen(function* () {
      const calls = [
        client['AlchemyStateStore.Create'](
          { name: 'Store', connection },
          headers('invalid'),
        ),
        client['AlchemyStateStore.List']({}, headers('invalid')),
        client['AlchemyStateStore.Rename'](
          { id: 'id', name: 'Name' },
          headers('invalid'),
        ),
        client['AlchemyStateStore.Delete']({ id: 'id' }, headers('invalid')),
      ];
      for (const call of calls) {
        const error = yield* Effect.flip(call);
        expect(error._tag).toBe('Unauthenticated');
      }
    }),
  );
});

it('returns the discovery reason through RPC without saving a failed connection', async () => {
  const reason =
    'Finding the Cloudflare Secrets Store failed: Cloudflare returned HTTP 403. Secrets Store Write required.';
  await run(
    (client) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          client['AlchemyStateStore.Create'](
            { name: 'Store', connection },
            headers('alice'),
          ),
        );
        expect(error).toMatchObject({
          _tag: 'StateStoreError',
          code: 'cloudflare-permission',
          reason,
        });
        expect(
          yield* client['AlchemyStateStore.List']({}, headers('alice')),
        ).toEqual([]);
        expect(JSON.stringify(error)).not.toContain(connection.apiToken);
      }),
    Object.assign(
      async (input: Parameters<typeof globalThis.fetch>[0]) =>
        String(input).endsWith('/secrets_store/stores')
          ? Response.json(
              {
                success: false,
                errors: [{ message: 'Secrets Store Write required.' }],
              },
              { status: 403 },
            )
          : discoveryFetch(input),
      { preconnect: () => {} },
    ),
  );
});

it('lists beyond one database page', async () => {
  await run((client) =>
    Effect.gen(function* () {
      for (let i = 0; i < 105; i++) {
        yield* client['AlchemyStateStore.Create'](
          { name: `Store ${i}`, connection },
          headers('alice'),
        );
      }
      const result = yield* client['AlchemyStateStore.List'](
        {},
        headers('alice'),
      );
      expect(result).toHaveLength(105);
      expect(new Set(result.map((item) => item.id)).size).toBe(105);
      expect(JSON.stringify(result)).not.toContain(connection.authToken);
    }),
  );
});

it('persists the raw token and removes the actual row on delete', async () => {
  const database = makeNodeSQLite({ path: ':memory:' });
  const table = SQLite.make(appTable, { database });
  const record = {
    id: 'one',
    access: 'view' as const,
    userId: 'alice',
    name: 'Store',
    connection,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* table.setup;
      const encoded = yield* alchemyStateStoreSchema.encode(record);
      expect(encoded._v).toBe('v3');
      expect(yield* alchemyStateStoreSchema.decode(encoded)).toEqual(record);
      yield* stores.insert(record);
      expect(
        (yield* stores.get({ id: 'one', userId: 'alice' }))?.value.connection
          .authToken,
      ).toBe(connection.authToken);
      const client = yield* RpcTest.makeClient(StateStores);
      yield* client['AlchemyStateStore.Delete'](
        { id: 'one' },
        headers('alice'),
      );
      expect(
        yield* stores.get(
          { id: 'one', userId: 'alice' },
          { excludeDeleted: false },
        ),
      ).toBeNull();
    }).pipe(
      Effect.scoped,
      Effect.provide(StateStoreHandlers.pipe(Layer.provide(table.layer))),
      Effect.provide(authzLayer.pipe(Layer.provide(resolver))),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, discoveryFetch),
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: 'manual',
      }),
      Effect.provide(table.layer),
      Effect.ensuring(Effect.sync(() => database.close?.())),
    ),
  );
});

it('detects admin access from the token and keeps replacement credentials private', async () => {
  const created = await run((client) =>
    Effect.gen(function* () {
      const created = yield* client['AlchemyStateStore.Create'](
        { name: 'Store', connection },
        headers('alice'),
      );
      expect(created.access).toBe('view');
      const admin = yield* client['AlchemyStateStore.Create'](
        { name: 'Admin store', connection },
        headers('alice'),
      ).pipe(Effect.provideService(FetchHttpClient.Fetch, adminFetch));
      expect(admin.access).toBe('admin');
      const input = {
        id: created.id,
        accountId: connection.accountId,
        apiToken: 'replacement-token',
      };
      yield* client['AlchemyStateStore.UpdateCredentials'](
        input,
        headers('bob'),
      ).pipe(Effect.flip);
      const saved = yield* client['AlchemyStateStore.UpdateCredentials'](
        input,
        headers('alice'),
      ).pipe(Effect.provideService(FetchHttpClient.Fetch, adminFetch));
      expect(saved.access).toBe('admin');
      expect(saved.connection.apiToken).toBe('xxxxxxxx');
      expect(JSON.stringify(saved)).not.toContain('replacement-token');
      const downgraded = yield* client['AlchemyStateStore.UpdateCredentials'](
        input,
        headers('alice'),
      );
      expect(downgraded.access).toBe('view');
      return created;
    }),
  );
  expect(created.access).toBe('view');
});

it('rejects empty fields, unsupported adapters, and invalid account IDs', () => {
  const decode = Schema.decodeUnknownSync(createStateStoreInput);
  for (const input of [
    { name: ' ', connection },
    { name: 'Store', connection: { ...connection, apiToken: '' } },
    { name: 'Store', connection: { ...connection, kind: 'aws-s3' } },
    { name: 'Store', connection: { ...connection, accountId: 'invalid' } },
  ])
    expect(() => decode(input)).toThrow();
});

it('migrates v1 URL/token connections without inventing account credentials', async () => {
  const legacy = {
    _v: 'v1',
    id: 'legacy',
    userId: 'alice',
    name: 'Old store',
    connection: {
      kind: 'cloudflare',
      url: connection.url,
      authToken: connection.authToken,
    },
    createdAt: 'now',
    updatedAt: 'now',
  };
  const decoded = await Effect.runPromise(
    alchemyStateStoreSchema.decode(legacy),
  );
  expect(decoded.connection).toEqual({
    ...legacy.connection,
    accountId: null,
    apiToken: null,
  });
});
