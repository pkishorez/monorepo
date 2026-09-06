import { Effect, Fiber } from 'effect';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { afterEach, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ makeDatabase: vi.fn() }));
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
