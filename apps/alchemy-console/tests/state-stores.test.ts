import { Effect, Layer, Schema } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import { Authz } from 'auth-toolkit/rpc';
import { authzLayer } from 'auth-toolkit/rpc/server';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { expect, it } from 'vite-plus/test';
import { appTable } from '../src/shared/contracts/app-table/index.ts';
import {
  alchemyStateStoreEntity as stores,
  alchemyStateStoreSchema,
} from '../src/shared/contracts/alchemy-state-store/index.ts';
import {
  StateStores,
  createStateStoreInput,
} from '../src/server/rpc/state-stores/index.ts';
import { StateStoreHandlers } from '../src/server/rpc/state-store-handlers/index.ts';

const connection = {
  kind: 'cloudflare' as const,
  url: 'https://state.example.workers.dev',
  authToken: 'private-test-token',
};
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
      expect(encoded._v).toBe('v1');
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
      Effect.provide(table.layer),
      Effect.ensuring(Effect.sync(() => database.close?.())),
    ),
  );
});

it('rejects empty fields, unsupported adapters, and URLs containing credentials', () => {
  const decode = Schema.decodeUnknownSync(createStateStoreInput);
  for (const input of [
    { name: ' ', connection },
    { name: 'Store', connection: { ...connection, authToken: '' } },
    { name: 'Store', connection: { ...connection, kind: 'aws-s3' } },
    {
      name: 'Store',
      connection: { ...connection, url: 'https://user:secret@example.com' },
    },
    {
      name: 'Store',
      connection: { ...connection, url: 'https://example.com?token=secret' },
    },
    { name: 'Store', connection: { ...connection, url: 'http://example.com' } },
  ])
    expect(() => decode(input)).toThrow();
});
