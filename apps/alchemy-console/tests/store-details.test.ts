import { Effect, Layer, Logger } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import { FetchHttpClient } from 'effect/unstable/http';
import { Authz } from 'auth-toolkit/rpc';
import { authzLayer } from 'auth-toolkit/rpc/server';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { expect, it, vi } from 'vite-plus/test';
import { appTable } from '../src/server/storage/state-store-database/index.ts';
import { alchemyStateStoreEntity as stores } from '../src/server/storage/state-store-database/index.ts';
import { ConsoleApi as StoreDetails } from '../src/shared/api/console-api/index.ts';
import { ConsoleHandlers as StoreDetailsHandlers } from '../src/server/handlers/console-handlers/index.ts';
import { StageDeletionLock } from '../src/server/storage/stage-deletion-lock/index.ts';

const token = 'private-store-token';
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

const makeClient = () => RpcTest.makeClient(StoreDetails);
const run = <A, E>(
  fetch: typeof globalThis.fetch,
  use: (
    client: Effect.Success<ReturnType<typeof makeClient>>,
  ) => Effect.Effect<A, E>,
  url = 'https://example.workers.dev',
  accountBased = false,
  logs: unknown[] = [],
) => {
  const database = makeNodeSQLite({ path: ':memory:' });
  const table = SQLite.make(appTable, { database });
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* table.setup;
      yield* stores.insert({
        id: 'store',
        access: 'view',
        userId: 'alice',
        name: 'Store',
        connection: {
          kind: 'cloudflare',
          accountId: accountBased ? 'a'.repeat(32) : null,
          apiToken: accountBased ? 'private-account-token' : null,
          url,
          authToken: token,
        },
        createdAt: 'now',
        updatedAt: 'now',
      });
      const client = yield* makeClient();
      return yield* use(client);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Logger.layer([
          Logger.make((event) => {
            logs.push(event.message);
          }),
        ]),
      ),
      Effect.provide(
        StoreDetailsHandlers.pipe(
          Layer.provide(
            Layer.succeed(StageDeletionLock, {
              acquire: () => Effect.die('Unexpected deletion'),
              release: () => Effect.void,
            }),
          ),
          Layer.provide(table.layer),
          Layer.provide(FetchHttpClient.layer),
        ),
      ),
      Effect.provide(authzLayer.pipe(Layer.provide(resolver))),
      Effect.provide(table.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: 'manual',
      }),
      Effect.ensuring(Effect.sync(() => database.close?.())),
    ),
  );
};
const options = (id = 'alice') => ({ headers: { cookie: id } });
const resource = {
  fqn: 'Bucket',
  logicalId: 'Bucket',
  resourceType: 'Cloudflare.R2.Bucket',
  status: 'replaced',
  instanceId: 'instance',
  providerVersion: 1,
  downstream: [],
  bindings: [],
  props: { password: 'password-secret' },
  attr: { name: 'bucket', nested: [{ __redacted__: 'wrapped-secret' }] },
  old: { props: { API_TOKEN: 'old-secret' } },
  deleteFirst: false,
  custom: { preserved: true },
};
const action = {
  kind: 'action',
  fqn: 'Task',
  logicalId: 'Task',
  actionType: 'Sync',
  status: 'ran',
  downstream: [],
  inputHash: 'hash',
  input: { ok: true },
  output: { clientSecret: 'action-secret' },
};
const fixtures: Record<string, unknown> = {
  '/state/stacks': ['EmptyStack', 'App', 'CloudflareStateStore'],
  '/state/stacks/EmptyStack/stages': [],
  '/state/stacks/App/stages': ['prod', 'empty'],
  '/state/stacks/App/stages/empty/output': null,
  '/state/stacks/App/stages/empty/resources': [],
  '/state/stacks/App/stages/prod/output': {
    endpoint: 'https://app.example.com',
    nested: { value: { __redacted__: 'output-secret' } },
    echo: token,
  },
  '/state/stacks/App/stages/prod/resources': ['Task', 'Gone', 'Bucket'],
  '/state/stacks/App/stages/prod/resources/Bucket': resource,
  '/state/stacks/App/stages/prod/resources/Task': action,
  '/state/stacks/App/stages/prod/resources/Gone': null,
};
const mockFetch = (data = fixtures) =>
  Object.assign(
    vi.fn(
      async (
        input: Parameters<typeof globalThis.fetch>[0],
        init?: Parameters<typeof globalThis.fetch>[1],
      ) => {
        expect(new Headers(init?.headers).get('authorization')).toBe(
          `Bearer ${token}`,
        );
        expect(init?.redirect).toBe('manual');
        const path = new URL(String(input)).pathname;
        if (!(path in data)) throw new Error(`Unexpected path: ${path}`);
        return Response.json(data[path]);
      },
    ),
    { preconnect: () => {} },
  );

it('loads each level independently using the saved connection, with masked state and outputs', async () => {
  const fetch = mockFetch();
  const logs: unknown[] = [];
  await run(
    fetch,
    (client) =>
      Effect.gen(function* () {
        const stacks = yield* client['AlchemyStateStore.ListStacks'](
          { storeId: 'store' },
          options(),
        );
        expect(stacks).toEqual({
          storeName: 'Store',
          data: ['CloudflareStateStore', 'App', 'EmptyStack'],
        });
        expect(fetch).toHaveBeenCalledTimes(1);
        const stages = yield* client['AlchemyStateStore.ListStages'](
          { storeId: 'store', stack: 'App' },
          options(),
        );
        expect(stages.data).toEqual(['empty', 'prod']);
        expect(fetch).toHaveBeenCalledTimes(2);
        const input = { storeId: 'store', stack: 'App', stage: 'prod' };
        const resources = yield* client['AlchemyStateStore.ListResources'](
          input,
          options(),
        );
        expect(resources.data).toEqual(['Bucket', 'Gone', 'Task']);
        expect(fetch).toHaveBeenCalledTimes(3);
        const bucket = yield* client['AlchemyStateStore.GetResourceState'](
          { ...input, resource: 'Bucket' },
          options(),
        );
        expect(bucket.data).toMatchObject({
          status: 'replaced',
          custom: { preserved: true },
          old: { props: { API_TOKEN: 'xxxxxxxx' } },
          attr: { nested: ['xxxxxxxx'] },
        });
        expect(fetch).toHaveBeenCalledTimes(4);
        const task = yield* client['AlchemyStateStore.GetResourceState'](
          { ...input, resource: 'Task' },
          options(),
        );
        expect(task.data).toMatchObject({
          kind: 'action',
          output: { clientSecret: 'xxxxxxxx' },
        });
        const gone = yield* client['AlchemyStateStore.GetResourceState'](
          { ...input, resource: 'Gone' },
          options(),
        );
        expect(gone.data).toBeNull();
        const stageView = yield* client['AlchemyStateStore.GetStageView'](
          input,
          options(),
        );
        for (const secret of [
          token,
          'password-secret',
          'wrapped-secret',
          'old-secret',
          'output-secret',
          'action-secret',
        ])
          expect(JSON.stringify([bucket, task, stageView])).not.toContain(
            secret,
          );
        expect(fetch).toHaveBeenCalledTimes(11);
      }),
    undefined,
    true,
    logs,
  );
  expect(logs.flat().filter((value) => typeof value === 'string')).toEqual([
    'Loaded state store from database',
    'Listed stacks',
    'Loaded state store from database',
    'Listed stages',
    'Loaded state store from database',
    'Listed resources',
    'Loaded state store from database',
    'Fetched resource state',
    'Loaded state store from database',
    'Fetched resource state',
    'Loaded state store from database',
    'Fetched resource state',
    'Loaded state store from database',
    'Fetched stage view',
  ]);
});

it('summarizes every resource in a stage with one call and masks nothing readable', async () => {
  const fetch = mockFetch({
    ...fixtures,
    '/state/stacks/App/stages/prod/resources/Broken': { fqn: 'Broken' },
    '/state/stacks/App/stages/prod/resources': [
      'Task',
      'Gone',
      'Broken',
      'Bucket',
    ],
  });
  await run(fetch, (client) =>
    Effect.gen(function* () {
      const stageView = yield* client['AlchemyStateStore.GetStageView'](
        { storeId: 'store', stack: 'App', stage: 'prod' },
        options(),
      );
      expect(stageView).toEqual({
        storeName: 'Store',
        data: {
          resources: [
            { fqn: 'Broken', kind: 'resource', type: null, status: null },
            {
              fqn: 'Bucket',
              kind: 'resource',
              type: 'Cloudflare.R2.Bucket',
              status: 'replaced',
            },
            { fqn: 'Gone', kind: 'resource', type: null, status: null },
            { fqn: 'Task', kind: 'action', type: 'Sync', status: 'ran' },
          ],
          outputs: {
            endpoint: 'https://app.example.com',
            nested: { value: 'xxxxxxxx' },
            echo: 'xxxxxxxx',
          },
        },
      });
      expect(JSON.stringify(stageView)).not.toContain('secret');
      expect(fetch).toHaveBeenCalledTimes(6);
    }),
  );
});

it('does not access the remote store for another user, a missing store, or an invalid session', async () => {
  const fetch = mockFetch();
  await run(fetch, (client) =>
    Effect.gen(function* () {
      for (const [user, storeId, tag] of [
        ['bob', 'store', 'StoreDetailsError'],
        ['alice', 'missing', 'StoreDetailsError'],
        ['invalid', 'store', 'Unauthenticated'],
      ]) {
        const input = {
          storeId,
          stack: 'App',
          stage: 'prod',
          resource: 'Bucket',
        };
        const calls = [
          client['AlchemyStateStore.ListStacks'](input, options(user)).pipe(
            Effect.asVoid,
          ),
          client['AlchemyStateStore.ListStages'](input, options(user)).pipe(
            Effect.asVoid,
          ),
          client['AlchemyStateStore.ListResources'](input, options(user)).pipe(
            Effect.asVoid,
          ),
          client['AlchemyStateStore.GetStageView'](input, options(user)).pipe(
            Effect.asVoid,
          ),
          client['AlchemyStateStore.GetResourceState'](
            input,
            options(user),
          ).pipe(Effect.asVoid),
        ];
        for (const call of calls) {
          const error = yield* Effect.flip(call);
          expect(error._tag).toBe(tag);
          if (error._tag === 'StoreDetailsError')
            expect(error.code).toBe('not-found');
        }
      }
    }),
  );
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects malformed resource state instead of returning a partial dump', async () => {
  const fetch = mockFetch({
    ...fixtures,
    '/state/stacks/App/stages/prod/resources/Bucket': {
      ...resource,
      status: 'invented',
    },
  });
  const logs: unknown[] = [];
  const error = await run(
    fetch,
    (client) =>
      Effect.flip(
        client['AlchemyStateStore.GetResourceState'](
          { storeId: 'store', stack: 'App', stage: 'prod', resource: 'Bucket' },
          options(),
        ),
      ),
    undefined,
    false,
    logs,
  );
  expect(error).toMatchObject({ code: 'invalid-state' });
  expect(logs.flat().filter((value) => typeof value === 'string')).toEqual([
    'Loaded state store from database',
    'Could not load state details',
  ]);
});

it('returns safe remote errors without exposing token or upstream bodies', async () => {
  const fetch = Object.assign(
    vi.fn(async () => new Response(token, { status: 401 })),
    { preconnect: () => {} },
  );
  const error = await run(fetch, (client) =>
    Effect.flip(
      client['AlchemyStateStore.ListStacks']({ storeId: 'store' }, options()),
    ),
  );
  expect(error).toMatchObject({ code: 'remote-error' });
  expect(JSON.stringify(error)).not.toContain(token);
});

it('rejects non-Worker endpoints before sending credentials', async () => {
  const fetch = mockFetch();
  const error = await run(
    fetch,
    (client) =>
      Effect.flip(
        client['AlchemyStateStore.ListStacks']({ storeId: 'store' }, options()),
      ),
    'https://127.0.0.1',
  );
  expect(error).toMatchObject({ code: 'unsupported-endpoint' });
  expect(fetch).not.toHaveBeenCalled();
});

it('refuses state API redirects instead of forwarding credentials', async () => {
  const fetch = Object.assign(
    vi.fn(
      async (
        _input: Parameters<typeof globalThis.fetch>[0],
        init?: Parameters<typeof globalThis.fetch>[1],
      ) => {
        expect(init?.redirect).toBe('manual');
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://elsewhere.example' },
        });
      },
    ),
    { preconnect: () => {} },
  );
  const error = await run(fetch, (client) =>
    Effect.flip(
      client['AlchemyStateStore.ListStacks']({ storeId: 'store' }, options()),
    ),
  );
  expect(error).toMatchObject({ code: 'remote-error' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('returns empty lists without reading any children', async () => {
  const fetch = mockFetch();
  const result = await run(fetch, (client) =>
    client['AlchemyStateStore.ListStages'](
      { storeId: 'store', stack: 'EmptyStack' },
      options(),
    ),
  );
  expect(result.data).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('encodes resource identifiers and rejects mismatched state', async () => {
  const fqn = 'folder/Bucket #1';
  const fetch = mockFetch({
    ['/state/stacks/App/stages/prod/resources/' +
    encodeURIComponent(encodeURIComponent(fqn))]: resource,
  });
  const error = await run(fetch, (client) =>
    Effect.flip(
      client['AlchemyStateStore.GetResourceState'](
        { storeId: 'store', stack: 'App', stage: 'prod', resource: fqn },
        options(),
      ),
    ),
  );
  expect(error).toMatchObject({ code: 'invalid-state' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
