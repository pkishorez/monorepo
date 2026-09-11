import { Effect, Fiber, Stream } from 'effect';
import { SQLite } from 'std-toolkit/db/sqlite';
import {
  appTable,
  alchemyStateStoreEntity as stores,
} from '../src/server/storage/state-store-database/index.ts';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { afterEach, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ makeDatabase: vi.fn(), execute: vi.fn() }));
vi.mock('../src/server/services/stage-destruction/native-engine.ts', () => ({
  execute: mocks.execute,
}));
vi.mock('std-toolkit/db/sqlite/d1', () => ({
  makeD1SQLite: mocks.makeDatabase,
}));
import { makeRpcRuntime, Rpc } from '../src/client/connections/rpc/index.ts';
import { handleRpc } from '../src/server/host/rpc-host/index.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('cancels server work when the query fiber is interrupted', async () => {
  vi.stubEnv('DEV', false);
  const database = makeNodeSQLite({ path: ':memory:' });
  mocks.makeDatabase.mockReturnValue(database);
  const started = Promise.withResolvers<void>();
  const aborted = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (new URL(request.url).hostname === 'console.example') {
        request.headers.set('cookie', 'session=test');
        return handleRpc(request, {} as D1Database);
      }
      if (new URL(request.url).hostname === 'auth.kishore.app') {
        return Promise.resolve(
          Response.json({
            user: { id: 'alice' },
            session: { id: 'session', userId: 'alice' },
          }),
        );
      }
      return new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener(
          'abort',
          () => {
            aborted();
            reject(request.signal.reason);
          },
          { once: true },
        );
        started.resolve();
      });
    }),
  );
  const runtime = makeRpcRuntime('https://console.example/rpc');
  try {
    const context = await Effect.runPromise(runtime.contextEffect);
    const fiber = Effect.runFork(
      Rpc.use((rpc) =>
        rpc['AlchemyStateStore.Create']({
          name: 'Test',
          connection: {
            kind: 'cloudflare',
            accountId: 'a'.repeat(32),
            apiToken: 'test-token',
          },
        }),
      ).pipe(Effect.provide(context)),
    );
    await started.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    await vi.waitFor(() => expect(aborted).toHaveBeenCalledTimes(1));
  } finally {
    await runtime.dispose();
    database.close?.();
  }
});

it('streams deletion progress through the real RPC host before completion', async () => {
  vi.stubEnv('DEV', false);
  const database = makeNodeSQLite({ path: ':memory:' });
  const table = SQLite.make(appTable, { database });
  mocks.makeDatabase.mockReturnValue(database);
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* table.setup;
      yield* stores.insert({
        id: 'store',
        userId: 'alice',
        name: 'Store',
        connection: {
          kind: 'cloudflare',
          accountId: 'a'.repeat(32),
          apiToken: 'cloud-token',
          authToken: 'state-token',
          url: 'https://state.example.workers.dev',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }).pipe(Effect.provide(table.layer)),
  );
  const progress = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  mocks.execute.mockImplementation((_input, _mode, emit) =>
    Effect.gen(function* () {
      emit({ kind: 'progress', id: 'Worker', status: 'deleting', message: '' });
      yield* Effect.promise(() => finish.promise);
      emit({ kind: 'complete', id: null, status: 'complete', message: 'Done' });
      return null;
    }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const host = new URL(request.url).hostname;
      if (host === 'console.example') {
        request.headers.set('cookie', 'session=test');
        return handleRpc(request, {} as D1Database);
      }
      if (host === 'auth.kishore.app')
        return Promise.resolve(
          Response.json({
            user: { id: 'alice' },
            session: { id: 'session', userId: 'alice' },
          }),
        );
      throw new Error('Unexpected request');
    }),
  );
  const runtime = makeRpcRuntime('https://console.example/rpc');
  try {
    const context = await Effect.runPromise(runtime.contextEffect);
    const seen: string[] = [];
    const result = Effect.runPromise(
      Rpc.use((rpc) =>
        rpc['AlchemyStateStore.DeleteStage']({
          storeId: 'store',
          stack: 'App',
          stage: 'dev',
          fingerprint: 'review',
        }).pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              if (event.kind === 'heartbeat') return;
              seen.push(event.kind);
              if (event.kind === 'progress') progress.resolve();
            }),
          ),
        ),
      ).pipe(Effect.provide(context)),
    );
    try {
      await progress.promise;
      expect(seen).toEqual(['progress']);
    } finally {
      finish.resolve();
      await result;
    }
    expect(seen).toEqual(['progress', 'complete']);
  } finally {
    await runtime.dispose();
    database.close?.();
  }
});

it('streams preview analysis and the failing resource through the real RPC host', async () => {
  vi.stubEnv('DEV', false);
  const database = makeNodeSQLite({ path: ':memory:' });
  const table = SQLite.make(appTable, { database });
  mocks.makeDatabase.mockReturnValue(database);
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* table.setup;
      yield* stores.insert({
        id: 'store',
        userId: 'alice',
        name: 'Store',
        connection: {
          kind: 'cloudflare',
          accountId: 'a'.repeat(32),
          apiToken: 'cloud-token',
          authToken: 'state-token',
          url: 'https://state.example.workers.dev',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }).pipe(Effect.provide(table.layer)),
  );
  mocks.execute.mockImplementation((_input, _mode, emit) =>
    Effect.sync(() => {
      emit({ kind: 'analyzing', id: 'BankTable', type: 'AWS.DynamoDB.Table' });
      return { error: 'not a Cloudflare resource', resource: 'BankTable' };
    }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const host = new URL(request.url).hostname;
      if (host === 'console.example') {
        request.headers.set('cookie', 'session=test');
        return handleRpc(request, {} as D1Database);
      }
      if (host === 'auth.kishore.app')
        return Promise.resolve(
          Response.json({
            user: { id: 'alice' },
            session: { id: 'session', userId: 'alice' },
          }),
        );
      throw new Error('Unexpected request');
    }),
  );
  const runtime = makeRpcRuntime('https://console.example/rpc');
  try {
    const context = await Effect.runPromise(runtime.contextEffect);
    const seen = await Effect.runPromise(
      Rpc.use((rpc) =>
        rpc['AlchemyStateStore.PreviewStageDeletion']({
          storeId: 'store',
          stack: 'App',
          stage: 'dev',
        }).pipe(
          Stream.filter((event) => event.kind !== 'heartbeat'),
          Stream.runCollect,
        ),
      ).pipe(Effect.provide(context)),
    );
    expect([...seen]).toEqual([
      { kind: 'analyzing', id: 'BankTable', type: 'AWS.DynamoDB.Table' },
      { kind: 'failed', id: 'BankTable', message: 'not a Cloudflare resource' },
    ]);
  } finally {
    await runtime.dispose();
    database.close?.();
  }
});
