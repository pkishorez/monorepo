import { describe, expect, test } from 'vitest';
import { simplifyTrace, simplifyTraceSummary, traceJson } from '../simplify.js';
import { renderTraceSummariesText, renderTraceText } from '../text.js';

const ms = (millis: number) => String(BigInt(millis) * 1_000_000n);
const service = (name: string) => ({
  resource: {
    attributes: [{ key: 'service.name', value: { stringValue: name } }],
  },
});

const details = {
  traceId: 'trace-1',
  spans: [
    {
      value: {
        traceId: 'trace-1',
        spanId: 'child',
        flowId: null,
        participantName: null,
        span: {
          name: 'db.query',
          parentSpanId: 'root',
          startTimeUnixNano: ms(1_010),
          endTimeUnixNano: ms(1_050),
          status: { code: 2, message: 'connection refused' },
          attributes: [{ key: 'db.system', value: { stringValue: 'sqlite' } }],
        },
        context: service('api'),
      },
    },
    {
      value: {
        traceId: 'trace-1',
        spanId: 'root',
        flowId: 'flow-9',
        participantName: 'api',
        span: {
          name: 'POST /checkout',
          startTimeUnixNano: ms(1_000),
          endTimeUnixNano: ms(1_100),
          status: { code: 1 },
          attributes: [
            { key: 'narrative', value: { stringValue: 'Handle a checkout' } },
            { key: 'flow.id', value: { stringValue: 'flow-9' } },
          ],
        },
        context: service('api'),
      },
    },
  ],
  logs: [
    {
      value: {
        id: 'log-1',
        traceId: 'trace-1',
        spanId: 'root',
        log: {
          timeUnixNano: ms(1_005),
          severityNumber: 9,
          body: { stringValue: 'Loaded cart' },
          attributes: [{ key: 'items', value: { intValue: '3' } }],
        },
      },
    },
    {
      value: {
        id: 'log-2',
        traceId: 'trace-1',
        spanId: null,
        log: {
          timeUnixNano: ms(1_090),
          severityText: 'warn',
          body: { stringValue: 'Slow request' },
        },
      },
    },
  ],
};

describe('trace output', () => {
  test('simplifies a Trace into a flat span list with nested logs', () => {
    const trace = traceJson(simplifyTrace(details));

    expect(trace).toMatchObject({
      traceId: 'trace-1',
      name: 'POST /checkout',
      serviceName: 'api',
      startTime: '1970-01-01T00:00:01.000Z',
      durationMs: 100,
      spanCount: 2,
      errorCount: 1,
      running: false,
    });
    expect(trace.spans.map((span) => span.spanId)).toEqual(['root', 'child']);
    expect(trace.spans[0]).toMatchObject({
      parentSpanId: null,
      narrative: 'Handle a checkout',
      status: 'ok',
      flowId: 'flow-9',
      attributes: { narrative: 'Handle a checkout', 'flow.id': 'flow-9' },
      logs: [
        { severity: 'INFO', body: 'Loaded cart', attributes: { items: 3 } },
      ],
    });
    expect(trace.spans[1]).toMatchObject({
      parentSpanId: 'root',
      status: 'error',
      statusMessage: 'connection refused',
      durationMs: 40,
    });
    expect(trace.logs).toEqual([
      expect.objectContaining({
        id: 'log-2',
        severity: 'WARN',
        body: 'Slow request',
      }),
    ]);
    expect(trace).not.toHaveProperty('startMs');
    expect(trace.spans[0]).not.toHaveProperty('startMs');
  });

  test('renders the Narrative view as text', () => {
    expect(renderTraceText(simplifyTrace(details))).toMatchInlineSnapshot(`
      "Trace trace-1
      service api · start 1970-01-01T00:00:01.000Z · duration 100.0ms · 2 spans · 1 errors

      +0.0ms     ▸ POST /checkout [ok 100.0ms]  — Handle a checkout
      +5.0ms       · INFO Loaded cart  items=3
      +10.0ms      ▸ db.query [error 40.0ms]  status: connection refused

      Log Records without a Span:
      +90.0ms      · WARN Slow request"
    `);
  });

  test('renders Trace Summaries one per row', () => {
    const summary = simplifyTraceSummary({
      traceId: 'trace-1',
      name: 'POST /checkout',
      serviceName: 'api',
      startTimeUnixNano: ms(1_000),
      endTimeUnixNano: ms(1_100),
      spanCount: 2,
      errorCount: 1,
      running: false,
    });
    expect(summary).toMatchObject({
      startTime: '1970-01-01T00:00:01.000Z',
      durationMs: 100,
    });
    expect(renderTraceSummariesText({ items: [summary] })).toContain(
      'trace-1  1970-01-01T00:00:01.000Z  100.0ms     2 spans     1 errors    api  POST /checkout',
    );
    expect(renderTraceSummariesText({ items: [] })).toBe('No Traces stored.');
  });
});
