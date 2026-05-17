import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { makeDbLayer } from '../storage/index.js';
import {
  clearTelemetry,
  ingestLogs,
  ingestMetrics,
  ingestTraces,
  queryLogs,
  queryMetrics,
  queryTraces,
} from '../orchestration/index.js';
import type {
  ExportLogsServiceRequest,
  ExportMetricsServiceRequest,
  ExportTraceServiceRequest,
} from '../domain/index.js';

const runWithDb = <A, E, R>(
  db: Database.Database,
  effect: Effect.Effect<A, E, R>,
) => {
  const provided = effect.pipe(
    Effect.provide(
      makeDbLayer({
        database: db,
        closeDatabase: false,
        tableName: 'lotel_test_data',
      }),
    ),
  );
  return Effect.runPromise(provided as Effect.Effect<A, E, never>);
};

describe('lotel telemetry storage', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db?.close();
  });

  it('stores OTLP trace spans with typed context and pages by ULID id', async () => {
    const request: ExportTraceServiceRequest = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'test-service' } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'test-scope', version: '1.0.0' },
              spans: [
                { traceId: 'trace-1', spanId: 'span-1', name: 'first' },
                { traceId: 'trace-1', spanId: 'span-2', name: 'second' },
              ],
            },
          ],
        },
      ],
    };

    const accepted = await runWithDb(db, ingestTraces(request));
    expect(accepted).toBe(2);

    const firstPage = await runWithDb(db, queryTraces());
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.items[0]!.value.record.spanId).toBe('span-1');
    expect(
      firstPage.items[0]!.value.context.resource?.attributes?.[0]?.key,
    ).toBe('service.name');
    expect(firstPage.items[0]!.value.context.scope?.name).toBe('test-scope');

    const cursor = firstPage.items[0]!.value.id;
    const secondPage = await runWithDb(db, queryTraces(cursor));
    expect(secondPage.items.map((item) => item.value.record.spanId)).toEqual([
      'span-2',
    ]);
  });

  it('stores OTLP log records with typed context', async () => {
    const request: ExportLogsServiceRequest = {
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'logger' } },
            ],
          },
          scopeLogs: [
            {
              scope: { name: 'log-scope' },
              logRecords: [
                {
                  traceId: 'trace-1',
                  spanId: 'span-1',
                  severityText: 'INFO',
                  body: { stringValue: 'hello' },
                },
              ],
            },
          ],
        },
      ],
    };

    const accepted = await runWithDb(db, ingestLogs(request));
    expect(accepted).toBe(1);

    const result = await runWithDb(db, queryLogs());
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.value.record.body?.stringValue).toBe('hello');
    expect(result.items[0]!.value.context.scope?.name).toBe('log-scope');
  });

  it('stores one OTLP metric per entity', async () => {
    const request: ExportMetricsServiceRequest = {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'metrics' } },
            ],
          },
          scopeMetrics: [
            {
              scope: { name: 'metric-scope' },
              metrics: [
                {
                  name: 'requests',
                  sum: {
                    isMonotonic: true,
                    dataPoints: [{ asInt: '1' }],
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const accepted = await runWithDb(db, ingestMetrics(request));
    expect(accepted).toBe(1);

    const result = await runWithDb(db, queryMetrics());
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.value.record.name).toBe('requests');
    expect(result.items[0]!.value.record.sum?.dataPoints?.[0]?.asInt).toBe('1');
  });

  it('clears all telemetry rows', async () => {
    await runWithDb(
      db,
      ingestTraces({
        resourceSpans: [{ scopeSpans: [{ spans: [{ name: 'span' }] }] }],
      }),
    );
    await runWithDb(
      db,
      ingestLogs({
        resourceLogs: [
          { scopeLogs: [{ logRecords: [{ body: { stringValue: 'log' } }] }] },
        ],
      }),
    );
    await runWithDb(
      db,
      ingestMetrics({
        resourceMetrics: [
          { scopeMetrics: [{ metrics: [{ name: 'metric' }] }] },
        ],
      }),
    );

    const deleted = await runWithDb(db, clearTelemetry);
    expect(deleted).toBe(3);

    await expect(runWithDb(db, queryTraces())).resolves.toEqual({ items: [] });
    await expect(runWithDb(db, queryLogs())).resolves.toEqual({ items: [] });
    await expect(runWithDb(db, queryMetrics())).resolves.toEqual({ items: [] });
  });
});
