import { Effect, Fiber, Logger, Tracer } from 'effect';
import { TestClock } from 'effect/testing';
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from 'effect/unstable/http';
import { expect, it, vi } from 'vite-plus/test';
import { discover } from '../src/server/services/cloudflare-discovery/index.ts';

const accountId = 'a'.repeat(32);
const apiToken = 'account-api-token';
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
type Diagnostics = {
  logs: Array<{ level: string; message: unknown }>;
  spans: Tracer.NativeSpan[];
};
const run = (fetch: typeof globalThis.fetch, diagnostics?: Diagnostics) =>
  Effect.runPromise(
    discover({ accountId, apiToken }).pipe(
      Effect.result,
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch),
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: 'manual',
      }),
      Effect.provide(
        Logger.layer([
          Logger.make((event) => {
            diagnostics?.logs.push({
              level: event.logLevel,
              message: event.message,
            });
          }),
        ]),
      ),
      Effect.withTracer(
        Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options);
            diagnostics?.spans.push(span);
            return span;
          },
        }),
      ),
    ),
  );

it('times out the whole discovery after 45 seconds and interrupts the pending request', async () => {
  const requests: string[] = [];
  let interrupted = false;
  const http = HttpClient.make((request) =>
    Effect.gen(function* () {
      requests.push(request.url);
      if (request.url.endsWith('/workers/subdomain')) {
        yield* Effect.sleep('30 seconds');
        return HttpClientResponse.fromWeb(
          request,
          Response.json({ success: true, result: { subdomain: 'example' } }),
        );
      }
      return yield* Effect.never.pipe(
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            interrupted = true;
          }),
        ),
      );
    }),
  );
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* discover({ accountId, apiToken }).pipe(
        Effect.result,
        Effect.provideService(HttpClient.HttpClient, http),
        Effect.forkChild,
      );
      yield* TestClock.adjust('45 seconds');
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: {
      code: 'discovery-failed',
      reason: 'Discovery exceeded 45 seconds. Please retry.',
    },
  });
  expect(requests).toHaveLength(2);
  expect(interrupted).toBe(true);
});

it.each([
  'none',
  'success',
  'http-400',
  'invalid-json',
  'missing-token',
  'network-error',
  'redirect',
] as const)(
  'discovers and verifies state credentials with preview exchange: %s',
  async (exchange) => {
    const diagnostics: Diagnostics = { logs: [], spans: [] };
    const exchangeUrl =
      'https://preview.example.cloudflareworkers.com/exchange?token=exchange-secret';
    const fetch = Object.assign(
      vi.fn(
        async (
          input: Parameters<typeof globalThis.fetch>[0],
          init?: Parameters<typeof globalThis.fetch>[1],
        ) => {
          const url = String(input);
          const headers = new Headers(init?.headers);
          expect(init?.redirect).toBe('manual');
          const success = (result: unknown) =>
            Response.json({ success: true, result });
          if (url.startsWith(base))
            expect(headers.get('authorization')).toBe(`Bearer ${apiToken}`);
          switch (url) {
            case `${base}/workers/subdomain`:
              return success({ subdomain: 'example' });
            case `${base}/workers/scripts/alchemy-state-store/settings`:
              return success({});
            case `${base}/secrets_store/stores`:
              return success([{ id: 'secret-store' }]);
            case `${base}/workers/subdomain/edge-preview`:
              return success({
                token: 'upload-token',
                exchange_url: exchange === 'none' ? null : exchangeUrl,
              });
            case exchangeUrl:
              expect(init?.method).toBe('GET');
              expect(headers.get('authorization')).toBeNull();
              if (exchange === 'http-400')
                return new Response('Bad Request', { status: 400 });
              if (exchange === 'invalid-json') return new Response('not json');
              if (exchange === 'missing-token') return Response.json({});
              if (exchange === 'network-error')
                throw new Error('exchange unavailable');
              if (exchange === 'redirect')
                return new Response(null, {
                  status: 302,
                  headers: { Location: 'https://elsewhere.example/' },
                });
              return Response.json({ token: 'exchanged-upload-token' });
            case `${base}/workers/scripts/alchemy-state-store/edge-preview`: {
              expect(init?.method).toBe('POST');
              expect(headers.get('cf-preview-upload-config-token')).toBe(
                exchange === 'success'
                  ? 'exchanged-upload-token'
                  : 'upload-token',
              );
              const form = init?.body as FormData;
              expect(JSON.parse(String(form.get('metadata')))).toMatchObject({
                main_module: 'probe.js',
                bindings: [
                  {
                    type: 'secrets_store_secret',
                    name: 'SECRET',
                    secret_name: 'AlchemyStateStoreToken',
                    store_id: 'secret-store',
                  },
                ],
              });
              expect(
                JSON.parse(String(form.get('wrangler-session-config'))),
              ).toEqual({ workers_dev: true, minimal_mode: true });
              expect(form.get('probe.js')).toBeInstanceOf(File);
              return success({ preview_token: 'preview-token' });
            }
            case 'https://alchemy-state-store.example.workers.dev/':
              expect(headers.get('authorization')).toBeNull();
              expect(headers.get('cf-workers-preview-token')).toBe(
                'preview-token',
              );
              return new Response(' state-bearer-token ');
            case 'https://alchemy-state-store.example.workers.dev/state/stacks':
              expect(headers.get('authorization')).toBe(
                'Bearer state-bearer-token',
              );
              expect(headers.get('cf-workers-preview-token')).toBeNull();
              return Response.json(['App']);
            case `${base}/storage/kv/namespaces`:
            case `${base}/r2/buckets`:
            case `${base}/d1/database`:
              return success([]);
            case `${base}/queues`:
              return exchange === 'success'
                ? success([])
                : Response.json(
                    { success: false, errors: [{ code: 10000 }] },
                    { status: 403 },
                  );
            default:
              throw new Error(`Unexpected request: ${url}`);
          }
        },
      ),
      { preconnect: () => {} },
    );
    const result = await run(fetch, diagnostics);
    expect(result).toMatchObject({
      _tag: 'Success',
      success: {
        url: 'https://alchemy-state-store.example.workers.dev',
        authToken: 'state-bearer-token',
      },
    });
    expect(fetch).toHaveBeenCalledTimes(exchange === 'none' ? 7 : 8);
    const messages = diagnostics.logs.flatMap((event) => event.message);
    expect(messages).toEqual(['Resolved state store connection']);
    expect(diagnostics.spans.map((span) => span.name)).toEqual([
      'CloudflareDiscovery.discover',
    ]);
    const telemetry = JSON.stringify({
      logs: diagnostics.logs,
      spans: diagnostics.spans.map((span) => ({
        name: span.name,
        attributes: [...span.attributes],
        events: span.events,
      })),
    });
    for (const secret of [
      apiToken,
      'upload-token',
      'exchanged-upload-token',
      'preview-token',
      'state-bearer-token',
      'exchange-secret',
    ])
      expect(telemetry).not.toContain(secret);
  },
);

it('still reports a rejected upload after falling back from an unsuccessful exchange', async () => {
  const exchangeUrl =
    'https://preview.example.cloudflareworkers.com/exchange?token=exchange-secret';
  const fetch = Object.assign(
    vi.fn(
      async (
        input: Parameters<typeof globalThis.fetch>[0],
        init?: Parameters<typeof globalThis.fetch>[1],
      ) => {
        const url = String(input);
        if (url === exchangeUrl)
          return new Response('Bad Request', { status: 400 });
        if (url.endsWith('/scripts/alchemy-state-store/edge-preview')) {
          expect(
            new Headers(init?.headers).get('cf-preview-upload-config-token'),
          ).toBe('upload-token');
          return Response.json(
            {
              success: false,
              errors: [
                {
                  code: 10000,
                  message: 'Missing Secrets Store Write permission',
                },
              ],
            },
            { status: 403 },
          );
        }
        let result: unknown = {};
        if (url.endsWith('/workers/subdomain'))
          result = { subdomain: 'example' };
        if (url.endsWith('/secrets_store/stores'))
          result = [{ id: 'secret-store' }];
        if (url.endsWith('/subdomain/edge-preview'))
          result = { token: 'upload-token', exchange_url: exchangeUrl };
        return Response.json({ success: true, result });
      },
    ),
    { preconnect: () => {} },
  );
  const result = await run(fetch);
  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: {
      code: 'cloudflare-permission',
      reason: expect.stringContaining(
        'Binding AlchemyStateStoreToken to the preview Worker failed: Cloudflare returned HTTP 403. Missing Secrets Store Write permission',
      ),
    },
  });
  expect(fetch).toHaveBeenCalledTimes(6);
  for (const secret of [apiToken, 'upload-token', 'exchange-secret'])
    expect(JSON.stringify(result)).not.toContain(secret);
});

it('reports permissions without reflecting Cloudflare error bodies or tokens', async () => {
  const fetch = Object.assign(
    vi.fn(async () => new Response(apiToken, { status: 403 })),
    { preconnect: () => {} },
  );
  const result = await run(fetch);
  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: {
      code: 'cloudflare-permission',
      reason: expect.stringContaining(
        'Reading the Workers subdomain failed: Cloudflare returned HTTP 403.',
      ),
    },
  });
  expect(JSON.stringify(result)).not.toContain(apiToken);
});

it('does not create a missing Worker', async () => {
  const fetch = Object.assign(
    vi.fn(async (input: Parameters<typeof globalThis.fetch>[0]) =>
      String(input).endsWith('/workers/subdomain')
        ? Response.json({ success: true, result: { subdomain: 'example' } })
        : new Response('', { status: 404 }),
    ),
    { preconnect: () => {} },
  );
  const result = await run(fetch);
  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: {
      code: 'state-store-missing',
      reason: expect.stringContaining(
        'Finding the alchemy-state-store Worker failed: Cloudflare returned HTTP 404.',
      ),
    },
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('rejects redirects explicitly without following them or exposing their location', async () => {
  const fetch = Object.assign(
    vi.fn(
      async (
        _input: Parameters<typeof globalThis.fetch>[0],
        init?: Parameters<typeof globalThis.fetch>[1],
      ) => {
        expect(init?.redirect).toBe('manual');
        return new Response(null, {
          status: 302,
          headers: { Location: `https://elsewhere.example/?token=${apiToken}` },
        });
      },
    ),
    { preconnect: () => {} },
  );
  const result = await run(fetch);
  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: {
      code: 'discovery-failed',
      reason: expect.stringContaining('HTTP 302. Redirects are not followed'),
    },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(result)).not.toContain(apiToken);
  expect(JSON.stringify(result)).not.toContain('elsewhere.example');
});

it('reports a nested transport cause without including credentials or request headers', async () => {
  const fetch = Object.assign(
    vi.fn(async () => {
      throw new TypeError('fetch failed', {
        cause: Object.assign(
          new Error(`DNS lookup failed for token ${apiToken}`),
          { code: 'ENOTFOUND' },
        ),
      });
    }),
    { preconnect: () => {} },
  );
  const result = await run(fetch);
  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: {
      reason: expect.stringContaining(
        'fetch failed: DNS lookup failed for token xxxxxxxx: ENOTFOUND',
      ),
    },
  });
  expect(JSON.stringify(result)).not.toContain(apiToken);
  expect(JSON.stringify(result)).not.toContain('authorization');
});

it('refuses an exchange URL outside Cloudflare before sending a request to it', async () => {
  const fetch = Object.assign(
    vi.fn(async (input: Parameters<typeof globalThis.fetch>[0]) => {
      const url = String(input);
      let result: unknown = {};
      if (url.endsWith('/workers/subdomain')) result = { subdomain: 'example' };
      if (url.endsWith('/secrets_store/stores'))
        result = [{ id: 'secret-store' }];
      if (url.endsWith('/subdomain/edge-preview'))
        result = { token: 'upload', exchange_url: 'https://127.0.0.1/secrets' };
      return Response.json({ success: true, result });
    }),
    { preconnect: () => {} },
  );
  const result = await run(fetch);
  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: {
      code: 'discovery-failed',
      reason: expect.stringContaining(
        'Exchanging the Workers preview session failed:',
      ),
    },
  });
  expect(fetch).toHaveBeenCalledTimes(4);
});

it('preserves structured Cloudflare errors while masking API and preview tokens', async () => {
  const diagnostics: Diagnostics = { logs: [], spans: [] };
  const fetch = Object.assign(
    vi.fn(async (input: Parameters<typeof globalThis.fetch>[0]) => {
      const url = String(input);
      let result: unknown = {};
      if (url.endsWith('/workers/subdomain')) result = { subdomain: 'example' };
      if (url.endsWith('/secrets_store/stores'))
        result = [{ id: 'secret-store' }];
      if (url.endsWith('/subdomain/edge-preview'))
        result = { token: 'private-upload-token' };
      if (url.endsWith('/scripts/alchemy-state-store/edge-preview'))
        return Response.json(
          {
            success: false,
            errors: [
              {
                code: 10000,
                message: `Secrets Store Write required. Submitted ${apiToken} and private-upload-token`,
              },
            ],
          },
          { status: 403 },
        );
      return Response.json({ success: true, result });
    }),
    { preconnect: () => {} },
  );
  const result = await run(fetch, diagnostics);
  expect(result).toMatchObject({
    _tag: 'Failure',
    failure: {
      code: 'cloudflare-permission',
      reason:
        'Binding AlchemyStateStoreToken to the preview Worker failed: Cloudflare returned HTTP 403. Secrets Store Write required. Submitted xxxxxxxx and xxxxxxxx (code 10000)',
    },
  });
  expect(JSON.stringify(result)).not.toContain(apiToken);
  expect(JSON.stringify(result)).not.toContain('private-upload-token');
  // The workflow reports the failure once; internal requests only add error context.
  expect(diagnostics.logs).toEqual([]);
});

it.each([
  ['invalid JSON', () => new Response(apiToken), 'invalid JSON response'],
  [
    'invalid shape',
    () => Response.json({ success: true, result: { token: apiToken } }),
    'required state-store details are missing or invalid',
  ],
  [
    'network failure',
    () => {
      throw new Error(`Request failed with ${apiToken}`);
    },
    'The Cloudflare request could not be completed',
  ],
  [
    'API failure envelope',
    () =>
      Response.json({
        success: false,
        errors: [{ message: 'Account unavailable', code: 1000 }],
      }),
    'Account unavailable (code 1000)',
  ],
] as const)(
  'explains %s without exposing submitted credentials',
  async (_name, response, reason) => {
    const fetch = Object.assign(
      vi.fn(async () => response()),
      { preconnect: () => {} },
    );
    const result = await run(fetch);
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        code: 'discovery-failed',
        reason: expect.stringContaining(reason),
      },
    });
    expect(JSON.stringify(result)).not.toContain(apiToken);
  },
);
