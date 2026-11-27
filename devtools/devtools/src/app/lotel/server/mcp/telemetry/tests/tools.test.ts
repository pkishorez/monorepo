import { Layer } from 'effect';
import { McpProtocol, McpServer } from 'effect/ai';
import { HttpRouter } from 'effect/http';
import { NodeHttpServer } from '@effect/platform-node';
import { afterEach, describe, expect, it } from 'vitest';
import { lotelServer } from '../../../index.js';

const ORIGIN = 'http://devtools.test';

const handlers: Array<{ dispose: () => Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(handlers.splice(0).map((each) => each.dispose()));
});

const serve = () => {
  const web = HttpRouter.toWebHandler(
    Layer.mergeAll(
      lotelServer({ db: ':memory:' }),
      McpServer.layerHttp({
        name: 'devtools',
        version: '0.0.0',
        path: '/mcp',
        protocols: [McpProtocol.v2025_06_18],
      }),
    ).pipe(Layer.provide(NodeHttpServer.layerHttpServices)),
    { disableLogger: true },
  );
  handlers.push(web);
  return (path: string, init: RequestInit) =>
    web.handler(new Request(`${ORIGIN}${path}`, init));
};

type Fetch = ReturnType<typeof serve>;

const post = (fetch: Fetch, path: string, body: object) =>
  fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const connect = async (fetch: Fetch) => {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-06-18',
  };
  const opened = await fetch('/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.0' },
      },
    }),
  });
  expect(opened.status).toBe(200);
  const session = {
    ...headers,
    'mcp-session-id': opened.headers.get('mcp-session-id') ?? '',
  };
  await fetch('/mcp', {
    method: 'POST',
    headers: session,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
  });
  let id = 1;
  return async (method: string, params: object) => {
    const answered = await fetch('/mcp', {
      method: 'POST',
      headers: session,
      body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
    });
    const text = await answered.text();
    const json = text.startsWith('{')
      ? text
      : text
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5))
          .at(-1)!;
    return JSON.parse(json).result;
  };
};

const otlpTrace = {
  resourceSpans: [
    {
      resource: {
        attributes: [{ key: 'service.name', value: { stringValue: 'api' } }],
      },
      scopeSpans: [
        {
          spans: [
            {
              traceId: 'trace-1',
              spanId: 'root',
              name: 'GET /users',
              startTimeUnixNano: '1000000000',
              endTimeUnixNano: '1500000000',
            },
          ],
        },
      ],
    },
  ],
};

const otlpLog = {
  resourceLogs: [
    {
      scopeLogs: [
        {
          logRecords: [
            {
              traceId: 'trace-1',
              spanId: 'root',
              timeUnixNano: '1100000000',
              body: { stringValue: 'looked the users up' },
            },
          ],
        },
      ],
    },
  ],
};

describe('the Lotel tools over MCP', () => {
  it('lists its three tools, small', async () => {
    const call = await connect(serve());
    const { tools } = await call('tools/list', {});
    expect(tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      'lotel_logs',
      'lotel_trace',
      'lotel_traces',
    ]);
    expect(JSON.stringify(tools).length).toBeLessThan(1_300);
  });

  it('lists the Traces OTLP sent, and opens one with its logs', async () => {
    const fetch = serve();
    await post(fetch, '/v1/traces', otlpTrace);
    await post(fetch, '/v1/logs', otlpLog);
    const call = await connect(fetch);

    const listed = await call('tools/call', {
      name: 'lotel_traces',
      arguments: {},
    });
    expect(listed.isError).toBe(false);
    expect(listed.structuredContent.traces).toEqual([
      {
        traceId: 'trace-1',
        name: 'GET /users',
        service: 'api',
        startedAt: new Date(1000).toISOString(),
        durationMs: 500,
        spans: 1,
        errors: 0,
        running: false,
      },
    ]);

    const opened = await call('tools/call', {
      name: 'lotel_trace',
      arguments: { traceId: 'trace-1' },
    });
    expect(opened.structuredContent).toEqual({
      traceId: 'trace-1',
      spans: [
        {
          span: 'root',
          parent: null,
          name: 'GET /users',
          service: 'api',
          startMs: 0,
          durationMs: 500,
          status: 'unset',
          attributes: {},
          events: [],
        },
      ],
      logs: [
        {
          atMs: 100,
          span: 'root',
          severity: null,
          body: 'looked the users up',
        },
      ],
    });

    const logs = await call('tools/call', {
      name: 'lotel_logs',
      arguments: {},
    });
    expect(logs.structuredContent.logs).toEqual([
      {
        at: new Date(1100).toISOString(),
        service: null,
        severity: null,
        body: 'looked the users up',
        trace: 'trace-1',
        span: 'root',
      },
    ]);
  });

  it('answers a Trace it does not hold as a tool error', async () => {
    const call = await connect(serve());
    const missing = await call('tools/call', {
      name: 'lotel_trace',
      arguments: { traceId: 'nope' },
    });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain('TraceNotFound');
  });
});
