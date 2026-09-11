import { Effect, Exit, Schema, Stream } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/unstable/http';
import { Authz } from 'auth-toolkit/rpc';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { expect, it, vi } from 'vite-plus/test';
import { consoleTable } from '../src/server/storage/table/index.ts';
import { storeEntity as stores } from '../src/server/storage/stores/index.ts';
import { credentialEntity as credentials } from '../src/server/storage/credentials/index.ts';
import {
  preview,
  destroy,
  deleteStack,
} from '../src/server/workflows/stores/stores/index.ts';
const native = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../src/server/services/deletion/engine/index.ts', () => native);

import {
  acknowledgesProtectedStage,
  isProtectedStage,
  protectedStageAcknowledgement,
} from '../src/shared/contracts/deletion/index.ts';
import {
  alchemyManagedStackName,
  compareStackNames,
  isAlchemyManagedStack,
} from '../src/shared/contracts/targets/index.ts';
import { deletionRequest } from '../src/server/services/deletion/deletion/index.ts';
import {
  readPermissions,
  writePermissions,
  cloudflareTokenUrl,
} from '../src/client/providers/cloudflare/index.ts';

const accountId = 'a'.repeat(32);
const secret = {
  provider: 'cloudflare' as const,
  accountId,
  apiToken: 'cloud-token',
};
const awsSecret = {
  provider: 'aws' as const,
  accessKeyId: 'AKIATEST',
  secretAccessKey: 'aws-secret',
};
const state = {
  url: 'https://state.example.workers.dev',
  authToken: 'state-token',
};
const target = { storeId: 'store', stack: 'App', stage: 'dev' };
const plan = {
  executable: true,
  stack: 'App',
  stage: 'dev',
  fingerprint: 'reviewed',
  credentials: [],
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
    Stream.Services<ReturnType<typeof preview>> | HttpClient.HttpClient
  >,
  fetch: typeof globalThis.fetch,
) => {
  const database = makeNodeSQLite({ path: ':memory:' });
  const table = SQLite.make(consoleTable, { database });
  const now = new Date().toISOString();
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* table.setup;
      yield* credentials.insert({
        id: 'cf',
        userId: 'alice',
        name: 'Personal',
        account: accountId,
        secret,
        createdAt: now,
        updatedAt: now,
      });
      yield* credentials.insert({
        id: 'aws',
        userId: 'alice',
        name: 'Work AWS',
        account: '123456789012',
        secret: awsSecret,
        createdAt: now,
        updatedAt: now,
      });
      yield* stores.insert({
        id: 'store',
        userId: 'alice',
        name: 'Store',
        state: { provider: 'cloudflare', credentialId: 'cf', ...state },
        grants: ['aws'],
        createdAt: now,
        updatedAt: now,
      });
      return yield* operation;
    }).pipe(
      Effect.provide(table.layer),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
      Effect.provideService(Authz.CurrentAuth, auth),
      Effect.ensuring(Effect.sync(() => database.close?.())),
    ),
  );
};

it('flags every prod prefix and requires the exact acknowledgement phrase', () => {
  for (const stage of ['prod', 'production', 'prod-eu', 'PROD', 'Production']) {
    expect(isProtectedStage(stage)).toBe(true);
    expect(acknowledgesProtectedStage(stage, undefined)).toBe(false);
    expect(acknowledgesProtectedStage(stage, 'i know what i am doing')).toBe(
      false,
    );
    expect(
      acknowledgesProtectedStage(stage, protectedStageAcknowledgement),
    ).toBe(true);
  }
  for (const stage of [
    'dev',
    'pr123',
    'staging',
    'preview-branch',
    'nonprod',
  ]) {
    expect(isProtectedStage(stage)).toBe(false);
    expect(acknowledgesProtectedStage(stage, undefined)).toBe(true);
  }
  expect(() =>
    Schema.decodeUnknownSync(deletionRequest)({
      ...target,
      stage: '',
      state,
      stateCredentialId: 'cf',
      available: [],
    }),
  ).toThrow();
});

it('classifies only the reserved Cloudflare state-store stack as Alchemy managed', () => {
  expect(isAlchemyManagedStack(alchemyManagedStackName)).toBe(true);
  expect(isAlchemyManagedStack('cloudflarestatestore')).toBe(false);
  expect(isAlchemyManagedStack('App')).toBe(false);
  expect(
    ['Zebra', alchemyManagedStackName, 'App'].sort(compareStackNames),
  ).toEqual([alchemyManagedStackName, 'App', 'Zebra']);
});

it('rejects generic preview and deletion for Alchemy-managed stacks', async () => {
  native.execute.mockClear();
  const request = { ...target, stack: alchemyManagedStackName };
  const fetch = Object.assign(vi.fn(), { preconnect: () => {} });

  const previewError = await run(Effect.flip(collect(preview(request))), fetch);
  expect(previewError).toMatchObject({ code: 'managed-stack' });

  const deletionError = await run(
    Effect.flip(
      collect(destroy({ ...request, fingerprint: 'not-applicable' })),
    ),
    fetch,
  );
  expect(deletionError).toMatchObject({ code: 'managed-stack' });
  expect(fetch).not.toHaveBeenCalled();
  expect(native.execute).not.toHaveBeenCalled();
});

it('deletes an empty application stack through Alchemy state', async () => {
  const fetch = Object.assign(
    vi.fn(async (input: Parameters<typeof globalThis.fetch>[0], init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/state/stacks/Empty/stages')
        return Response.json([], { status: 200 });
      expect(path).toBe('/state/stacks/Empty');
      expect(init?.method).toBe('DELETE');
      return new Response(null, { status: 204 });
    }),
    { preconnect: () => {} },
  );
  await expect(
    run(deleteStack({ storeId: 'store', stack: 'Empty' }), fetch),
  ).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('refuses to delete a stack that has deployed stages', async () => {
  const fetch = Object.assign(
    vi.fn(async (input: Parameters<typeof globalThis.fetch>[0]) => {
      expect(new URL(String(input)).pathname).toBe(
        '/state/stacks/Application/stages',
      );
      return Response.json(['prod'], { status: 200 });
    }),
    { preconnect: () => {} },
  );
  const error = await run(
    Effect.flip(deleteStack({ storeId: 'store', stack: 'Application' })),
    fetch,
  );
  expect(error).toMatchObject({ code: 'non-empty' });
  expect(fetch).toHaveBeenCalledOnce();
});

it('rejects unacknowledged protected stages and other owners before invoking Alchemy', async () => {
  native.execute.mockClear();
  const fetch = Object.assign(
    vi.fn(async () => Response.json(plan)),
    { preconnect: () => {} },
  );
  for (const stage of ['prod', 'prod-us', 'PRODUCTION']) {
    for (const acknowledgement of [undefined, 'I know what I am doing']) {
      const exit = await run(
        Effect.exit(
          collect(
            destroy({
              ...target,
              stage,
              fingerprint: 'reviewed',
              acknowledgement,
            }),
          ),
        ),
        fetch,
      );
      expect(Exit.isFailure(exit)).toBe(true);
    }
  }
  expect(
    Exit.isFailure(
      await run(
        Effect.exit(collect(preview({ ...target, storeId: 'another-owner' }))),
        fetch,
      ),
    ),
  ).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  expect(native.execute).not.toHaveBeenCalled();
});

it('passes the store state, its credentials and the user choice to Alchemy and streams analysis before the plan', async () => {
  native.execute.mockImplementation((input, mode, emit) =>
    Effect.sync(() => {
      expect(input).toMatchObject({
        stack: 'App',
        stage: 'dev',
        state,
        stateCredentialId: 'cf',
        credentials: [
          { provider: 'aws', credentialId: 'aws', region: 'eu-west-1' },
        ],
        available: [
          { id: 'cf', name: 'Personal', account: accountId, secret },
          {
            id: 'aws',
            name: 'Work AWS',
            account: '123456789012',
            secret: awsSecret,
          },
        ],
      });
      expect(mode).toBe('preview');
      emit({ kind: 'analyzing', id: 'Worker', type: 'Cloudflare.Worker' });
      emit({ kind: 'analyzed', id: 'Worker', type: 'Cloudflare.Worker' });
      return plan;
    }),
  );
  expect(
    await run(
      collect(
        preview({
          ...target,
          credentials: [
            { provider: 'aws', credentialId: 'aws', region: 'eu-west-1' },
          ],
        }),
      ),
      fetch,
    ),
  ).toEqual([
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

it('previews a protected stage freely and deletes it once acknowledged', async () => {
  native.execute.mockClear();
  const prodPlan = { ...plan, stage: 'prod' };
  native.execute.mockImplementation((_input, mode, emit) =>
    Effect.sync(() => {
      if (mode === 'preview') return prodPlan;
      emit({ kind: 'complete', id: null, status: 'deleted', message: '' });
      return null;
    }),
  );
  const fetch = Object.assign(
    vi.fn(async () => Response.json(prodPlan)),
    { preconnect: () => {} },
  );
  const previewed = await run(
    collect(preview({ ...target, stage: 'prod' })),
    fetch,
  );
  expect(previewed.at(-1)).toMatchObject({ kind: 'plan' });
  const deleted = await run(
    collect(
      destroy({
        ...target,
        stage: 'prod',
        fingerprint: prodPlan.fingerprint,
        acknowledgement: protectedStageAcknowledgement,
      }),
    ),
    fetch,
  );
  expect(deleted.at(-1)).toMatchObject({ kind: 'complete' });
  expect(native.execute).toHaveBeenCalledTimes(2);
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

it('offers minimal read and write token templates', () => {
  const params = (access: 'read' | 'write') =>
    JSON.parse(
      new URL(cloudflareTokenUrl(accountId, access)!).searchParams.get(
        'permissionGroupKeys',
      )!,
    );
  expect(params('read')).toEqual([
    { key: 'workers_scripts', type: 'edit' },
    { key: 'secrets_store', type: 'edit' },
  ]);
  expect(readPermissions).toHaveLength(2);
  expect(params('write')).toEqual(
    writePermissions.map(([key, , type]) => ({ key, type })),
  );
  for (const key of [
    'workers_scripts',
    'secrets_store',
    'd1',
    'workers_r2',
    'workers_kv_storage',
    'queues',
    'workers_routes',
    'dns',
  ])
    expect(params('write')).toContainEqual({ key, type: 'edit' });
  expect(params('write')).toContainEqual({ key: 'zone', type: 'read' });
  // No account-wide permissions: only the products Alchemy deletes through.
  for (const key of ['account_settings', 'account_api_tokens', 'billing'])
    expect(params('write').map((p: { key: string }) => p.key)).not.toContain(
      key,
    );
  expect(
    new URL(cloudflareTokenUrl(accountId, 'write')!).searchParams.get(
      'accountId',
    ),
  ).toBe(accountId);
});
