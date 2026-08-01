import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { Effect, Metric } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
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
