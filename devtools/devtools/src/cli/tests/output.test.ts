import { describe, expect, test } from 'vitest';
import { renderFlowText, simplifyFlowList } from '../flow-output.js';
import {
  renderTraceSummariesText,
  renderTraceText,
  simplifyTrace,
  simplifyTraceSummary,
  traceJson,
} from '../trace-output.js';

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

describe('flow output', () => {
  test('simplifies the Flow catalog', () => {
    expect(
      simplifyFlowList({
        items: [{ value: { flowId: 'call-1', latestTimeUnixNano: ms(2_000) } }],
      }),
    ).toEqual({
      items: [{ flowId: 'call-1', latestTime: '1970-01-01T00:00:02.000Z' }],
    });
  });

  test('renders a Recorded Flow as chronological lines', () => {
    const text = renderFlowText({
      id: 'call-1',
      latestTimestamp: 1_300,
      activations: [],
      warnings: [
        { recordType: 'log', recordId: 'log-x', message: 'End without Start' },
      ],
      items: [
        {
          kind: 'activity',
          id: 'a',
          participantName: 'client',
          name: 'Create offer',
          timestamp: 1_000,
          duration: 50,
          status: 'success',
          traceId: 't',
          spanId: 's',
          logs: [{ timestamp: 1_010, severity: 'info', message: 'sdp ready' }],
        },
        {
          kind: 'message',
          id: 'b',
          participantName: 'client',
          name: 'Offer',
          timestamp: 1_150,
          severity: 'info',
          destination: 'server',
          messageId: 'm1',
        },
        {
          kind: 'activation-end',
          id: 'c',
          participantName: 'server',
          name: 'done',
          timestamp: 1_300,
          severity: 'info',
          outcome: 'completed',
        },
      ],
    });
    expect(text).toMatchInlineSnapshot(`
      "Flow call-1
      participants client, server · 3 items · 0 activations · latest 1970-01-01T00:00:01.300Z

      +0.0ms     client ▸ Create offer [success 50.0ms]
      +10.0ms        · INFO sdp ready
      +150.0ms   client → server: Offer
      +300.0ms   server ⏹ activation end (completed): done

      Warnings:
        - log log-x: End without Start"
    `);
  });
});
