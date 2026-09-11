import { Effect, Layer, Schema } from 'effect';
import { RpcTest } from 'effect/unstable/rpc';
import { FetchHttpClient } from 'effect/unstable/http';
import { Authz } from 'auth-toolkit/rpc';
import { authzLayer } from 'auth-toolkit/rpc/server';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { expect, it } from 'vite-plus/test';
import { consoleTable } from '../src/server/storage/table/index.ts';
import {
  storeEntity as stores,
  storeSchema,
} from '../src/server/storage/stores/index.ts';
import {
  credentialEntity as credentials,
  credentialSchema,
} from '../src/server/storage/credentials/index.ts';
import { ConsoleApi } from '../src/shared/api/console-api/index.ts';
import { createStoreInput } from '../src/shared/contracts/stores/index.ts';
import { createCredentialInput } from '../src/shared/contracts/credentials/index.ts';
import { ConsoleHandlers } from '../src/server/handlers/console-handlers/index.ts';
import { DeletionLock } from '../src/server/storage/deletion-lock/index.ts';

const unusedDeletionLock = Layer.succeed(DeletionLock, {
  acquire: () => Effect.die('Unexpected deletion'),
  release: () => Effect.void,
});

const accountId = 'a'.repeat(32);
const apiToken = 'account-test-token';
const authToken = 'private-test-token';
const awsAccount = '123456789012';
const cloudflareSecret = {
  provider: 'cloudflare' as const,
  accountId,
  apiToken,
};
const awsSecret = {
  provider: 'aws' as const,
  accessKeyId: 'AKIATESTPRIVATE',
  secretAccessKey: 'aws-private-secret',
};
const providerFetch = Object.assign(
  async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    const success = (result: unknown) =>
      Response.json({ success: true, result });
    if (url.hostname.endsWith('.amazonaws.com')) {
      const authorization =
        new Headers(init?.headers).get('authorization') ?? '';
      expect(authorization).toContain(`Credential=${awsSecret.accessKeyId}/`);
      return new Response(
        `<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/"><GetCallerIdentityResult><Account>${awsAccount}</Account><Arn>arn:aws:iam::${awsAccount}:user/test</Arn><UserId>test</UserId></GetCallerIdentityResult><ResponseMetadata><RequestId>test</RequestId></ResponseMetadata></GetCallerIdentityResponse>`,
        { headers: { 'content-type': 'text/xml' } },
      );
    }
    if (url.hostname !== 'api.cloudflare.com') {
      if (url.pathname === '/state/stacks') return Response.json([]);
      return new Response(authToken);
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
    throw new Error(`Unexpected request: ${url.pathname}`);
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

const makeClient = () => RpcTest.makeClient(ConsoleApi);
const run = <A, E>(
  use: (
    client: Effect.Success<ReturnType<typeof makeClient>>,
  ) => Effect.Effect<A, E, never>,
  fetch: typeof globalThis.fetch = providerFetch,
) => {
  const database = makeNodeSQLite({ path: ':memory:' });
  const table = SQLite.make(consoleTable, { database });
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* table.setup;
      const client = yield* makeClient();
      return yield* use(client);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        ConsoleHandlers.pipe(
          Layer.provide(table.layer),
          Layer.provide(unusedDeletionLock),
        ),
      ),
      Effect.provide(authzLayer.pipe(Layer.provide(resolver))),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: 'manual',
      }),
      Effect.provide(table.layer),
      Effect.ensuring(Effect.sync(() => database.close?.())),
    ),
  );
};

it('verifies credentials with the provider, never returns secrets, and isolates owners', async () => {
  await run((client) =>
    Effect.gen(function* () {
      const cloudflare = yield* client['Credentials.Create'](
        { name: ' Personal ', secret: cloudflareSecret },
        headers('alice'),
      );
      expect(cloudflare).toMatchObject({
        userId: 'alice',
        name: 'Personal',
        provider: 'cloudflare',
        account: accountId,
      });
      expect(cloudflare).not.toHaveProperty('secret');
      const aws = yield* client['Credentials.Create'](
        { name: 'Work AWS', secret: awsSecret },
        headers('alice'),
      );
      expect(aws).toMatchObject({ provider: 'aws', account: awsAccount });
      const listed = yield* client['Credentials.List']({}, headers('alice'));
      expect(listed.map((item) => item.id)).toEqual([cloudflare.id, aws.id]);
      expect(JSON.stringify(listed)).not.toContain(apiToken);
      expect(JSON.stringify(listed)).not.toContain(awsSecret.secretAccessKey);
      expect(yield* client['Credentials.List']({}, headers('bob'))).toEqual([]);

      const stolen = yield* Effect.flip(
        client['Credentials.Update'](
          { id: cloudflare.id, name: 'Stolen' },
          headers('bob'),
        ),
      );
      expect(stolen).toMatchObject({
        _tag: 'CredentialError',
        code: 'not-found',
      });
      const renamed = yield* client['Credentials.Update'](
        { id: cloudflare.id, name: 'Renamed' },
        headers('alice'),
      );
      expect(renamed.name).toBe('Renamed');
      const replaced = yield* client['Credentials.Update'](
        {
          id: cloudflare.id,
          name: 'Renamed',
          secret: { ...cloudflareSecret, apiToken: 'replacement-token' },
        },
        headers('alice'),
      );
      expect(JSON.stringify(replaced)).not.toContain('replacement-token');
      const swapped = yield* Effect.flip(
        client['Credentials.Update'](
          { id: cloudflare.id, name: 'Renamed', secret: awsSecret },
          headers('alice'),
        ),
      );
      expect(swapped).toMatchObject({ code: 'verification-failed' });
      yield* client['Credentials.Delete']({ id: aws.id }, headers('alice'));
      expect(
        (yield* client['Credentials.List']({}, headers('alice'))).map(
          (item) => item.id,
        ),
      ).toEqual([cloudflare.id]);
    }),
  );
});

it('rejects a credential the provider refuses without saving it', async () => {
  await run(
    (client) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          client['Credentials.Create'](
            { name: 'Bad', secret: cloudflareSecret },
            headers('alice'),
          ),
        );
        expect(error).toMatchObject({
          _tag: 'CredentialError',
          code: 'verification-failed',
        });
        expect(error.reason).toContain('Cloudflare returned HTTP 403');
        expect(JSON.stringify(error)).not.toContain(apiToken);
        expect(yield* client['Credentials.List']({}, headers('alice'))).toEqual(
          [],
        );
      }),
    Object.assign(
      async () =>
        Response.json(
          { success: false, errors: [{ message: 'Token invalid.' }] },
          { status: 403 },
        ),
      { preconnect: () => {} },
    ),
  );
});

it('creates a store from a Cloudflare credential, edits its grants, and refuses to delete credentials in use', async () => {
  await run((client) =>
    Effect.gen(function* () {
      const cloudflare = yield* client['Credentials.Create'](
        { name: 'Personal', secret: cloudflareSecret },
        headers('alice'),
      );
      const aws = yield* client['Credentials.Create'](
        { name: 'Work AWS', secret: awsSecret },
        headers('alice'),
      );
      const bobs = yield* client['Credentials.Create'](
        { name: 'Bob AWS', secret: awsSecret },
        headers('bob'),
      );
      const missing = yield* Effect.flip(
        client['Stores.Create'](
          { name: 'Store', stateCredentialId: aws.id, grants: [] },
          headers('alice'),
        ),
      );
      expect(missing).toMatchObject({
        _tag: 'StoreError',
        code: 'credential-missing',
      });
      const created = yield* client['Stores.Create'](
        {
          name: ' My store ',
          stateCredentialId: cloudflare.id,
          // Foreign, unknown and self grants are dropped silently.
          grants: [aws.id, bobs.id, 'unknown', cloudflare.id],
        },
        headers('alice'),
      );
      expect(created).toMatchObject({
        userId: 'alice',
        name: 'My store',
        state: { provider: 'cloudflare', credentialId: cloudflare.id },
        grants: [aws.id],
      });
      expect(JSON.stringify(created)).not.toContain(authToken);
      expect(yield* client['Stores.List']({}, headers('alice'))).toEqual([
        created,
      ]);
      expect(yield* client['Stores.List']({}, headers('bob'))).toEqual([]);

      const inUse = yield* Effect.flip(
        client['Credentials.Delete']({ id: aws.id }, headers('alice')),
      );
      expect(inUse).toMatchObject({ code: 'in-use' });
      expect(inUse.reason).toContain('My store');

      const stolen = yield* Effect.flip(
        client['Stores.Update'](
          { id: created.id, name: 'Stolen', grants: [] },
          headers('bob'),
        ),
      );
      expect(stolen).toMatchObject({ _tag: 'StoreError', code: 'not-found' });
      const updated = yield* client['Stores.Update'](
        { id: created.id, name: 'Renamed', grants: [] },
        headers('alice'),
      );
      expect(updated).toMatchObject({ name: 'Renamed', grants: [] });
      yield* client['Credentials.Delete']({ id: aws.id }, headers('alice'));
      const locating = yield* Effect.flip(
        client['Credentials.Delete']({ id: cloudflare.id }, headers('alice')),
      );
      expect(locating).toMatchObject({ code: 'in-use' });

      yield* client['Stores.Delete']({ id: created.id }, headers('alice'));
      expect(yield* client['Stores.List']({}, headers('alice'))).toEqual([]);
      yield* client['Credentials.Delete'](
        { id: cloudflare.id },
        headers('alice'),
      );
      const gone = yield* Effect.flip(
        client['Stores.Update'](
          { id: created.id, name: 'Missing', grants: [] },
          headers('alice'),
        ),
      );
      expect(gone).toMatchObject({ code: 'not-found' });
    }),
  );
});

it('requires authentication for every operation', async () => {
  await run((client) =>
    Effect.gen(function* () {
      const calls = [
        client['Credentials.Create'](
          { name: 'Personal', secret: cloudflareSecret },
          headers('invalid'),
        ),
        client['Credentials.List']({}, headers('invalid')),
        client['Stores.Create'](
          { name: 'Store', stateCredentialId: 'id', grants: [] },
          headers('invalid'),
        ),
        client['Stores.List']({}, headers('invalid')),
        client['Stores.Update'](
          { id: 'id', name: 'Name', grants: [] },
          headers('invalid'),
        ),
        client['Stores.Delete']({ id: 'id' }, headers('invalid')),
      ];
      for (const call of calls) {
        const error = yield* Effect.flip(
          call as Effect.Effect<unknown, { _tag: string }>,
        );
        expect(error._tag).toBe('Unauthenticated');
      }
    }),
  );
});

it('returns the discovery reason through RPC without saving a failed store', async () => {
  const reason =
    'Finding the Cloudflare Secrets Store failed: Cloudflare returned HTTP 403. Secrets Store Write required.';
  await run(
    (client) =>
      Effect.gen(function* () {
        const cloudflare = yield* client['Credentials.Create'](
          { name: 'Personal', secret: cloudflareSecret },
          headers('alice'),
        );
        const error = yield* Effect.flip(
          client['Stores.Create'](
            { name: 'Store', stateCredentialId: cloudflare.id, grants: [] },
            headers('alice'),
          ),
        );
        expect(error).toMatchObject({
          _tag: 'StoreError',
          code: 'cloudflare-permission',
          reason,
        });
        expect(yield* client['Stores.List']({}, headers('alice'))).toEqual([]);
        expect(JSON.stringify(error)).not.toContain(apiToken);
      }),
    Object.assign(
      async (
        input: Parameters<typeof globalThis.fetch>[0],
        init?: RequestInit,
      ) =>
        String(input).endsWith('/secrets_store/stores')
          ? Response.json(
              {
                success: false,
                errors: [{ message: 'Secrets Store Write required.' }],
              },
              { status: 403 },
            )
          : providerFetch(input, init),
      { preconnect: () => {} },
    ),
  );
});

it('lists beyond one database page', async () => {
  await run((client) =>
    Effect.gen(function* () {
      const cloudflare = yield* client['Credentials.Create'](
        { name: 'Personal', secret: cloudflareSecret },
        headers('alice'),
      );
      for (let i = 0; i < 105; i++) {
        yield* client['Stores.Create'](
          { name: `Store ${i}`, stateCredentialId: cloudflare.id, grants: [] },
          headers('alice'),
        );
      }
      const result = yield* client['Stores.List']({}, headers('alice'));
      expect(result).toHaveLength(105);
      expect(new Set(result.map((item) => item.id)).size).toBe(105);
      expect(JSON.stringify(result)).not.toContain(authToken);
    }),
  );
});

it('persists raw secrets at schema v1 and removes the actual rows on delete', async () => {
  const database = makeNodeSQLite({ path: ':memory:' });
  const table = SQLite.make(consoleTable, { database });
  const credential = {
    id: 'cf',
    userId: 'alice',
    name: 'Personal',
    account: accountId,
    secret: cloudflareSecret,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };
  const store = {
    id: 'one',
    userId: 'alice',
    name: 'Store',
    state: {
      provider: 'cloudflare' as const,
      credentialId: 'cf',
      url: 'https://alchemy-state-store.example.workers.dev',
      authToken,
    },
    grants: [],
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:00.000Z',
  };
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* table.setup;
      for (const [schema, record] of [
        [credentialSchema, credential],
        [storeSchema, store],
      ] as const) {
        const encoded = yield* (schema as typeof storeSchema).encode(
          record as typeof store,
        );
        expect(encoded._v).toBe('v1');
      }
      yield* credentials.insert(credential);
      yield* stores.insert(store);
      expect(
        (yield* credentials.get({ id: 'cf', userId: 'alice' }))?.value.secret,
      ).toEqual(cloudflareSecret);
      expect(
        (yield* stores.get({ id: 'one', userId: 'alice' }))?.value.state
          .authToken,
      ).toBe(authToken);
      const client = yield* makeClient();
      yield* client['Stores.Delete']({ id: 'one' }, headers('alice'));
      yield* client['Credentials.Delete']({ id: 'cf' }, headers('alice'));
      expect(
        yield* stores.get(
          { id: 'one', userId: 'alice' },
          { excludeDeleted: false },
        ),
      ).toBeNull();
      expect(
        yield* credentials.get(
          { id: 'cf', userId: 'alice' },
          { excludeDeleted: false },
        ),
      ).toBeNull();
    }).pipe(
      Effect.scoped,
      Effect.provide(
        ConsoleHandlers.pipe(
          Layer.provide(table.layer),
          Layer.provide(unusedDeletionLock),
        ),
      ),
      Effect.provide(authzLayer.pipe(Layer.provide(resolver))),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, providerFetch),
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: 'manual',
      }),
      Effect.provide(table.layer),
      Effect.ensuring(Effect.sync(() => database.close?.())),
    ),
  );
});

it('rejects empty fields, unknown providers, and invalid account IDs', () => {
  const decodeStore = Schema.decodeUnknownSync(createStoreInput);
  for (const input of [
    { name: ' ', stateCredentialId: 'cf', grants: [] },
    { name: 'Store', stateCredentialId: '', grants: [] },
    { name: 'Store', stateCredentialId: 'cf' },
  ])
    expect(() => decodeStore(input)).toThrow();
  const decodeCredential = Schema.decodeUnknownSync(createCredentialInput);
  for (const input of [
    { name: ' ', secret: cloudflareSecret },
    { name: 'Personal', secret: { ...cloudflareSecret, apiToken: '' } },
    { name: 'Personal', secret: { ...cloudflareSecret, accountId: 'invalid' } },
    { name: 'Personal', secret: { ...cloudflareSecret, provider: 'gcp' } },
    { name: 'Work', secret: { ...awsSecret, secretAccessKey: ' ' } },
  ])
    expect(() => decodeCredential(input)).toThrow();
});
