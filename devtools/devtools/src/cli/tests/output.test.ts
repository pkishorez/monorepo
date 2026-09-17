import { describe, expect, test } from 'vitest';
import { projectJournal, type Entry, type Journal } from '@pkishorez/flow';
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
  const entry = (
    over: Partial<Entry> & Pick<Entry, 'kind' | 'id' | 'name'>,
  ): Entry =>
    ({
      flowId: 'call-1',
      participantName: 'client',
      sequence: 0,
      timestamp: 1_000,
      severity: 'info',
      ...over,
    }) as Entry;

  const journal = (entries: ReadonlyArray<Entry>): Journal => ({
    flowId: 'call-1',
    entries,
    ordering: 'recorded',
  });

  test('summarises Flows newest first', () => {
    const quiet = projectJournal(
      journal([entry({ kind: 'event', id: 'a', name: 'started' })]),
    );
    const later = projectJournal({
      flowId: 'call-2',
      ordering: 'recorded',
      entries: [
        entry({
          kind: 'event',
          id: 'b',
          name: 'started',
          flowId: 'call-2',
          timestamp: 2_000,
        }),
      ],
    });
    expect(simplifyFlowList([quiet, later])).toEqual({
      items: [
        {
          flowId: 'call-2',
          status: 'quiet',
          participants: ['client'],
          entries: 1,
          latestTime: '1970-01-01T00:00:02.000Z',
        },
        {
          flowId: 'call-1',
          status: 'quiet',
          participants: ['client'],
          entries: 1,
          latestTime: '1970-01-01T00:00:01.000Z',
        },
      ],
    });
  });

  test('renders a Flow Projection as chronological lines', () => {
    const text = renderFlowText(
      projectJournal(
        journal([
          entry({
            kind: 'activation-start',
            id: 'a',
            name: 'Create offer',
            activationId: 'act-1',
          }),
          entry({
            kind: 'event',
            id: 'b',
            name: 'sdp ready',
            timestamp: 1_010,
          }),
          entry({
            kind: 'message',
            id: 'c',
            name: 'Offer',
            timestamp: 1_150,
            messageId: 'm1',
            destination: 'server',
          }),
          entry({
            kind: 'activation-end',
            id: 'd',
            name: 'Create offer',
            timestamp: 1_300,
            activationId: 'act-1',
            outcome: 'completed',
          }),
          entry({
            kind: 'resume',
            id: 'e',
            name: 'Answer',
            timestamp: 1_400,
          }),
        ]),
      ),
    );
    expect(text).toMatchInlineSnapshot(`
      "Flow call-1 (recorded order)
      participants client, server · 5 entries · 1 activations · 0 waits · status quiet · latest 1970-01-01T00:00:01.400Z

      +0.0ms     client ⏵ activation start: Create offer
      +10.0ms    client • info sdp ready
      +150.0ms   client → server: Offer
      +300.0ms   client ⏹ activation end (completed): Create offer
      +400.0ms   client ⏯ resume: Answer

      Activations:
        +0.0ms     client ▸ Create offer [completed 300.0ms]

      Warnings:
        - resume-without-wait e: Resumed while no Wait was open."
    `);
  });
});
