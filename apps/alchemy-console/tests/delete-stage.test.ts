import { Effect, Exit, Schema, Stream } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { Authz } from 'auth-toolkit/rpc';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { expect, it, vi } from 'vite-plus/test';
import {
  appTable,
  alchemyStateStoreEntity as stores,
} from '../src/server/storage/state-store-database/index.ts';
import {
  preview,
  destroy,
} from '../src/server/workflows/delete-stage/index.ts';
import {
  StageDeletionLock,
  makeStageDeletionLock,
} from '../src/server/storage/stage-deletion-lock/index.ts';
const native = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock(
  '../src/server/services/stage-destruction/native-engine.ts',
  () => native,
);

import { canDeleteStage } from '../src/shared/contracts/delete-stage/index.ts';
import { destructionRequest } from '../src/server/services/stage-destruction/request.ts';
import {
  adminPermissions,
  cloudflareTokenUrl,
} from '../src/client/features/store-list/cloudflare-token-url.ts';

const connection = {
  kind: 'cloudflare' as const,
  accountId: 'a'.repeat(32),
  apiToken: 'cloud-token',
  url: 'https://state.example.workers.dev',
  authToken: 'state-token',
};
const target = { storeId: 'store', stack: 'App', stage: 'dev' };
const plan = {
  stack: 'App',
  stage: 'dev',
  accountId: connection.accountId,
  fingerprint: 'reviewed',
  resources: [],
};
const user = {
  id: 'alice',
  name: 'Alice',
  email: 'alice@example.com',
  emailVerified: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const auth = {
  user,
  session: {
    id: 'session',
    userId: user.id,
    token: 'session-token',
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

const collect = <A extends { kind: string }, E, R>(
  stream: Stream.Stream<A, E, R>,
) =>
  Stream.runCollect(stream).pipe(
    Effect.map((events) => [...events].filter((e) => e.kind !== 'heartbeat')),
  );
const run = <A, E>(
  operation: Effect.Effect<
    A,
    E,
    Stream.Services<ReturnType<typeof preview>> | StageDeletionLock
  >,
  fetch: typeof globalThis.fetch,
  access: 'view' | 'admin' = 'admin',
) => {
  const database = makeNodeSQLite({ path: ':memory:' });
  const table = SQLite.make(appTable, { database });
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* table.setup;
      yield* makeStageDeletionLock(database).setup;
      yield* stores.insert({
        id: 'store',
        userId: 'alice',
        name: 'Store',
        access,
        connection,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return yield* operation;
    }).pipe(
      Effect.provide(table.layer),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
      Effect.provide(makeStageDeletionLock(database).layer),
      Effect.provideService(Authz.CurrentAuth, auth),
      Effect.ensuring(Effect.sync(() => database.close?.())),
    ),
  );
};

it('protects every prod prefix and allows all other nonempty stage names', () => {
  for (const stage of ['prod', 'production', 'prod-eu', 'PROD', 'Production']) {
    expect(canDeleteStage(stage)).toBe(false);
    expect(() =>
      Schema.decodeUnknownSync(destructionRequest)({
        ...target,
        stage,
        connection,
      }),
    ).toThrow();
  }
  for (const stage of ['dev', 'pr123', 'staging', 'preview-branch', 'nonprod'])
    expect(canDeleteStage(stage)).toBe(true);
  expect(() =>
    Schema.decodeUnknownSync(destructionRequest)({
      ...target,
      stage: '',
      connection,
    }),
  ).toThrow();
});

it('rejects protected stages, other owners, and view-only access before invoking Alchemy', async () => {
  native.execute.mockClear();
  const fetch = Object.assign(
    vi.fn(async () => Response.json(plan)),
    { preconnect: () => {} },
  );
  for (const stage of ['prod', 'prod-us', 'PRODUCTION']) {
    const exit = await run(
      Effect.exit(collect(preview({ ...target, stage }))),
      fetch,
    );
    expect(Exit.isFailure(exit)).toBe(true);
  }
  expect(
    Exit.isFailure(
      await run(
        Effect.exit(collect(preview({ ...target, storeId: 'another-owner' }))),
        fetch,
      ),
    ),
  ).toBe(true);
  expect(
    Exit.isFailure(
      await run(Effect.exit(collect(preview(target))), fetch, 'view'),
    ),
  ).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  expect(native.execute).not.toHaveBeenCalled();
});

it('passes only saved credentials to Alchemy and streams analysis before the plan', async () => {
  native.execute.mockImplementation((input, mode, emit) =>
    Effect.sync(() => {
      expect(input).toMatchObject({
        stack: 'App',
        stage: 'dev',
        connection: {
          accountId: connection.accountId,
          apiToken: connection.apiToken,
          authToken: connection.authToken,
          url: connection.url,
        },
      });
      expect(mode).toBe('preview');
      emit({ kind: 'analyzing', id: 'Worker', type: 'Cloudflare.Worker' });
      emit({ kind: 'analyzed', id: 'Worker', type: 'Cloudflare.Worker' });
      return plan;
    }),
  );
  expect(await run(collect(preview(target)), fetch)).toEqual([
    { kind: 'analyzing', id: 'Worker', type: 'Cloudflare.Worker' },
    { kind: 'analyzed', id: 'Worker', type: 'Cloudflare.Worker' },
    { kind: 'plan', plan },
  ]);
});

it('reports which resource stopped planning', async () => {
  native.execute.mockImplementation((_input, _mode, emit) =>
    Effect.sync(() => {
      emit({ kind: 'analyzing', id: 'BankTable', type: 'AWS.DynamoDB.Table' });
      return {
        error: 'AWS.DynamoDB.Table is not a Cloudflare resource.',
        resource: 'BankTable',
      };
    }),
  );
  expect(await run(collect(preview(target)), fetch)).toEqual([
    { kind: 'analyzing', id: 'BankTable', type: 'AWS.DynamoDB.Table' },
    {
      kind: 'failed',
      id: 'BankTable',
      message: 'AWS.DynamoDB.Table is not a Cloudflare resource.',
    },
  ]);
});

it('delivers progress before native deletion finishes and preserves partial failure', async () => {
  const finish = Promise.withResolvers<void>();
  const first = Promise.withResolvers<void>();
  native.execute.mockImplementation((_input, _mode, emit) =>
    Effect.gen(function* () {
      emit({ kind: 'progress', id: 'Worker', status: 'deleted', message: '' });
      yield* Effect.promise(() => finish.promise);
      emit({
        kind: 'failed',
        id: null,
        status: 'failed',
        message: 'D1 deletion failed; remaining state preserved.',
      });
      return null;
    }),
  );
  const seen: string[] = [];
  const result = run(
    destroy({ ...target, fingerprint: 'reviewed' }).pipe(
      Stream.runForEach((event) =>
        Effect.sync(() => {
          if (event.kind === 'heartbeat') return;
          seen.push(event.kind);
          if (event.kind === 'progress') first.resolve();
        }),
      ),
    ),
    fetch,
  );
  try {
    await first.promise;
    expect(seen).toEqual(['progress']);
  } finally {
    finish.resolve();
    await result;
  }
  expect(seen).toEqual(['progress', 'failed']);
});

it('preselects the broad admin template and keeps the existing view permissions', () => {
  const params = (access: 'admin' | 'view') =>
    JSON.parse(
      new URL(
        cloudflareTokenUrl(connection.accountId, access)!,
      ).searchParams.get('permissionGroupKeys')!,
    );
  expect(params('view')).toEqual([
    { key: 'workers_scripts', type: 'edit' },
    { key: 'secrets_store', type: 'edit' },
  ]);
  expect(params('admin')).toHaveLength(adminPermissions.length);
  for (const key of [
    'workers_scripts',
    'd1',
    'workers_r2',
    'workers_kv_storage',
    'queues',
    'workers_routes',
    'dns',
    'zone',
  ])
    expect(params('admin')).toContainEqual({ key, type: 'edit' });
  expect(
    new URL(
      cloudflareTokenUrl(connection.accountId, 'admin')!,
    ).searchParams.get('accountId'),
  ).toBe(connection.accountId);
});
