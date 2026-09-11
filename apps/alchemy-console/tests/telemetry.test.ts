import { Effect } from 'effect';
import type { OtlpLogger, OtlpTracer } from 'effect/unstable/observability';
import { SQLite } from 'std-toolkit/db/sqlite';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import { afterEach, expect, it, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({ makeDatabase: vi.fn() }));
vi.mock('std-toolkit/db/sqlite/d1', () => ({
  makeD1SQLite: mocks.makeDatabase,
}));

import { makeRpcRuntime, Rpc } from '../src/client/connections/rpc/index.ts';
import { handleRpc } from '../src/server/host/rpc-host/index.ts';
import { consoleTable } from '../src/server/storage/table/index.ts';
import { telemetryLayer as clientTelemetry } from '../src/client/telemetry/index.ts';
import { telemetryLayer as serverTelemetry } from '../src/server/telemetry/index.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('preserves authenticated RPC and exports linked spans with safe correlated logs', async () => {
  const traces: OtlpTracer.TraceData[] = [];
  const logs: OtlpLogger.LogsData[] = [];
  const database = makeNodeSQLite({ path: ':memory:' });
  await Effect.runPromise(SQLite.make(consoleTable, { database }).setup);
  mocks.makeDatabase.mockReturnValue(database);
  const apiToken = 'private-cloudflare-token';
  const cookie = 'session=private-session-token';
  let signedIn = true;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.hostname === 'console.example') {
        // Match the browser: credentials: 'omit' suppresses the session cookie.
        if (signedIn && request.credentials !== 'omit')
          request.headers.set('cookie', cookie);
        return handleRpc(request, {} as D1Database);
      }
      if (url.hostname === 'api.cloudflare.com') {
        return Response.json(
          { errors: [{ message: `Access denied for ${apiToken}` }] },
          { status: 403 },
        );
      }
      if (url.hostname === 'auth.kishore.computer') {
        return Response.json({
          user: { id: 'alice' },
          session: { id: 'session', userId: 'alice' },
        });
      }
      expect(url.origin).toBe('http://127.0.0.1:14400');
      expect(init?.redirect).toBe('manual');
      expect(init?.credentials).toBe('omit');
      if (url.pathname === '/v1/traces') traces.push(await request.json());
      else if (url.pathname === '/v1/logs') logs.push(await request.json());
      else throw new Error(`Unexpected telemetry signal: ${url.pathname}`);
      return Response.json({ partialSuccess: {} });
    }),
  );

  const runtime = makeRpcRuntime('https://console.example/rpc');
  try {
    // use-effect-ts starts its own fibers, so the UI must inherit this context.
    const context = await Effect.runPromise(runtime.contextEffect);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.logInfo('Submitted credential');
        const rpc = yield* Rpc;
        return yield* rpc['Credentials.Create']({
          name: 'Test credential',
          secret: {
            provider: 'cloudflare',
            accountId: 'a'.repeat(32),
            apiToken,
          },
        });
      }).pipe(
        Effect.withSpan('UI.action'),
        Effect.provide(context),
        Effect.flip,
      ),
    );
    expect(result).toMatchObject({ code: 'verification-failed' });

    const list = Rpc.use((rpc) => rpc['Stores.List']({})).pipe(
      Effect.provide(context),
    );
    expect(await Effect.runPromise(list)).toEqual([]);

    signedIn = false;
    expect(await Effect.runPromise(Effect.flip(list))).toMatchObject({
      _tag: 'Unauthenticated',
    });
  } finally {
    await runtime.dispose();
    database.close?.();
  }

  const spans = traces.flatMap((payload) =>
    payload.resourceSpans.flatMap((resource) =>
      resource.scopeSpans.flatMap((scope) =>
        scope.spans
          .filter((span) => span.endTimeUnixNano !== undefined)
          .map((span) => ({ ...span, service: scope.scope.name })),
      ),
    ),
  );
  expect(spans.some((span) => span.name === 'UI.query')).toBe(false);
  const ui = spans.find((span) => span.name === 'UI.action');
  const client = spans.find(
    (span) => span.name === 'RpcClient.Credentials.Create',
  );
  const server = spans.find(
    (span) => span.name === 'RpcServer.Credentials.Create',
  );
  const discovery = spans.find(
    (span) => span.name === 'CloudflareProvider.verify',
  );
  // Two RPC calls run; follow the chain from the UI action rather than the first match.
  const httpClient = spans.find(
    (span) =>
      span.name === 'http.client POST' && span.parentSpanId === client?.spanId,
  );
  const httpServer = spans.find(
    (span) =>
      span.name === 'http.server POST' &&
      span.parentSpanId === httpClient?.spanId,
  );
  expect(ui).toMatchObject({ service: 'alchemy-console-frontend' });
  expect(client).toMatchObject({
    traceId: ui?.traceId,
    parentSpanId: ui?.spanId,
  });
  expect(server).toMatchObject({
    service: 'alchemy-console-backend',
    traceId: client?.traceId,
    parentSpanId: httpServer?.spanId,
  });
  expect(httpClient).toMatchObject({ parentSpanId: client?.spanId });
  expect(httpServer).toMatchObject({ parentSpanId: httpClient?.spanId });
  expect(discovery).toMatchObject({ traceId: server?.traceId });

  const records = logs.flatMap((payload) =>
    payload.resourceLogs.flatMap((resource) =>
      resource.scopeLogs.flatMap((scope) => scope.logRecords ?? []),
    ),
  );
  expect(records).toContainEqual(
    expect.objectContaining({
      body: { stringValue: 'Submitted credential' },
      traceId: ui?.traceId,
      spanId: ui?.spanId,
    }),
  );
  expect(records.some((record) => record.traceId === discovery?.traceId)).toBe(
    true,
  );
  const exported = JSON.stringify({ traces, logs });
  expect(exported).toContain('Could not create credential');
  expect(exported).toContain('Listed stores');
  expect(exported).not.toContain('Discovery step');
  expect(exported).not.toContain(apiToken);
  expect(exported).not.toContain(cookie);
});

it('does not contact the local collector in production', async () => {
  vi.stubEnv('DEV', false);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const telemetryLayer of [clientTelemetry, serverTelemetry]) {
    await Effect.runPromise(
      Effect.logInfo('Production').pipe(
        Effect.withSpan('production'),
        Effect.provide(telemetryLayer()),
      ),
    );
  }
  expect(fetch).not.toHaveBeenCalled();
});
