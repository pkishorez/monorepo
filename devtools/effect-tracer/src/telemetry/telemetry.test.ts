import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { Effect, Metric } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { makeDevTelemetryLayer } from './dev-telemetry/index.js';
import { makeTelemetryLayer } from './index.js';

const servers = new Set<ReturnType<typeof createServer>>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  servers.clear();
});

describe('makeTelemetryLayer', () => {
  it('exports traces, logs, and metrics as OTLP/HTTP JSON', async () => {
    const requests = new Map<string, unknown[]>();
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const path = request.url ?? '';
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        requests.set(path, [...(requests.get(path) ?? []), payload]);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"partialSuccess":{}}');
      });
    });
    servers.add(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    const { port } = server.address() as AddressInfo;

    const counter = Metric.counter('test.telemetry.events', {
      incremental: true,
    });
    const program = Effect.gen(function* () {
      yield* Metric.update(Metric.withAttributes(counter, { result: 'ok' }), 1);
      yield* Effect.logInfo('telemetry integration test').pipe(
        Effect.annotateLogs({ testId: 'telemetry-test' }),
      );
      yield* Effect.sleep('1100 millis');
    }).pipe(
      Effect.withSpan('test.telemetry', {
        attributes: { testId: 'telemetry-test' },
      }),
      Effect.provide(
        makeTelemetryLayer({
          endpoint: `http://127.0.0.1:${port}`,
          serviceName: 'telemetry-test',
          serviceVersion: '1.0.0',
        }),
      ),
    );

    await Effect.runPromise(program);

    expect(requests.get('/v1/traces')).toBeDefined();
    expect(requests.get('/v1/logs')).toBeDefined();
    expect(requests.get('/v1/metrics')).toBeDefined();
    expect(JSON.stringify(requests.get('/v1/traces'))).toContain(
      'test.telemetry',
    );
    expect(JSON.stringify(requests.get('/v1/logs'))).toContain(
      'telemetry integration test',
    );
    expect(JSON.stringify(requests.get('/v1/metrics'))).toContain(
      'test.telemetry.events',
    );
  });

  it('does not fail the application when the collector is unavailable', async () => {
    const program = Effect.logInfo('collector unavailable test').pipe(
      Effect.withSpan('test.collector-unavailable'),
      Effect.provide(makeTelemetryLayer({ endpoint: 'http://127.0.0.1:1' })),
    );

    await expect(Effect.runPromise(program)).resolves.toBeUndefined();
  });

  it('can configure traces, logs, and metrics independently', async () => {
    const requests = new Set<string>();
    const server = createServer((request, response) => {
      requests.add(request.url ?? '');
      request.resume();
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"partialSuccess":{}}');
    });
    servers.add(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    const { port } = server.address() as AddressInfo;

    await Effect.runPromise(
      Effect.logInfo('logs and traces only').pipe(
        Effect.withSpan('test.no-metrics'),
        Effect.delay('1100 millis'),
        Effect.provide(
          makeTelemetryLayer({
            endpoint: `http://127.0.0.1:${port}`,
            traces: true,
            logs: true,
            metrics: false,
          }),
        ),
      ),
    );

    expect(requests).toContain('/v1/traces');
    expect(requests).toContain('/v1/logs');
    expect(requests).not.toContain('/v1/metrics');
  });
});

describe('makeDevTelemetryLayer', () => {
  it('exports span start, log, and span end as ordered individual requests', async () => {
    const requests: Array<{ path: string; payload: any }> = [];
    let confirmStarted!: () => void;
    const startedExported = new Promise<void>((resolve) => {
      confirmStarted = resolve;
    });
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const received = {
          path: request.url ?? '',
          payload: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        };
        requests.push(received);
        if (
          received.path === '/v1/traces' &&
          received.payload.resourceSpans[0].scopeSpans[0].spans[0]
            .endTimeUnixNano === undefined
        ) {
          confirmStarted();
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"partialSuccess":{}}');
      });
    });
    servers.add(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    const { port } = server.address() as AddressInfo;

    await Effect.runPromise(
      Effect.promise(() => startedExported).pipe(
        Effect.andThen(Effect.logInfo('development telemetry')),
        Effect.withSpan('test.dev-telemetry', {
          attributes: { testId: 'dev-telemetry' },
        }),
        Effect.provide(
          makeDevTelemetryLayer({
            endpoint: `http://127.0.0.1:${port}`,
            serviceName: 'dev-telemetry-test',
          }),
        ),
      ),
    );

    expect(requests.map(({ path }) => path)).toEqual([
      '/v1/traces',
      '/v1/logs',
      '/v1/traces',
    ]);

    const started =
      requests[0]?.payload.resourceSpans[0].scopeSpans[0].spans[0];
    const ended = requests[2]?.payload.resourceSpans[0].scopeSpans[0].spans[0];
    const log = requests[1]?.payload.resourceLogs[0].scopeLogs[0].logRecords[0];

    expect(started.endTimeUnixNano).toBeUndefined();
    expect(started.status).toEqual({ code: 0 });
    expect(started.attributes).toEqual([]);
    expect(ended.traceId).toBe(started.traceId);
    expect(ended.spanId).toBe(started.spanId);
    expect(ended.endTimeUnixNano).toBeDefined();
    expect(JSON.stringify(ended.attributes)).toContain('dev-telemetry');
    expect(log.traceId).toBe(started.traceId);
    expect(log.spanId).toBe(started.spanId);
  });

  it('skips a provisional span that completes while still queued', async () => {
    const requests: unknown[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"partialSuccess":{}}');
      });
    });
    servers.add(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    const { port } = server.address() as AddressInfo;

    await Effect.runPromise(
      Effect.void.pipe(
        Effect.withSpan('test.dev-coalesced'),
        Effect.provide(
          makeDevTelemetryLayer({
            endpoint: `http://127.0.0.1:${port}`,
            logs: false,
          }),
        ),
      ),
    );

    expect(requests).toHaveLength(1);
    expect(JSON.stringify(requests[0])).toContain('endTimeUnixNano');
  });

  it('supports retries without failing the application', async () => {
    let requests = 0;
    const server = createServer((request, response) => {
      requests += 1;
      request.resume();
      response.writeHead(requests === 1 ? 503 : 200, {
        'content-type': 'application/json',
      });
      response.end('{"partialSuccess":{}}');
    });
    servers.add(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve()),
    );
    const { port } = server.address() as AddressInfo;

    await Effect.runPromise(
      Effect.void.pipe(
        Effect.withSpan('test.dev-retry'),
        Effect.provide(
          makeDevTelemetryLayer({
            endpoint: `http://127.0.0.1:${port}`,
            logs: false,
            retries: 1,
          }),
        ),
      ),
    );

    expect(requests).toBe(2);
  });

  it('drops unavailable collector requests after the configured timeout', async () => {
    await expect(
      Effect.runPromise(
        Effect.void.pipe(
          Effect.withSpan('test.dev-unavailable'),
          Effect.provide(
            makeDevTelemetryLayer({
              endpoint: 'http://127.0.0.1:1',
              logs: false,
              requestTimeout: '20 millis',
              shutdownTimeout: '100 millis',
            }),
          ),
        ),
      ),
    ).resolves.toBeUndefined();
  });
});
