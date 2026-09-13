import { describe, expect, test } from 'vitest';
import type { RecordedFlowSchema } from '@pkishorez/lotel/flow';

import { flowStatusOf, makeFlowReport } from './flow-report';

type RecordedFlow = typeof RecordedFlowSchema.Type;

const start = Date.UTC(2026, 0, 1, 12, 0, 0);
const copiedAt = new Date(Date.UTC(2026, 0, 1, 12, 5, 0));

const flow: RecordedFlow = {
  id: 'attempt-1',
  parentFlowId: 'session-1',
  latestTimestamp: start + 2_500,
  activations: [
    {
      participantName: 'peer:alice',
      name: 'Connection attempt',
      startItemId: 'start',
      endItemId: 'end',
      startTimestamp: start,
      endTimestamp: start + 2_500,
      outcome: 'failed',
    },
  ],
  warnings: [
    { recordType: 'log', recordId: 'log-9', message: 'End without Start' },
  ],
  items: [
    {
      id: 'start',
      kind: 'activation-start',
      name: 'Connection attempt',
      participantName: 'peer:alice',
      severity: 'info',
      timestamp: start,
    },
    {
      id: 'offer',
      kind: 'message',
      name: 'Offer',
      participantName: 'peer:alice',
      destination: 'peer:bob',
      messageId: 'msg-offer',
      severity: 'info',
      timestamp: start + 12,
      attributes: { sdpType: 'offer', sdp: 'v=0\r\no=- 1' },
    },
    {
      id: 'gather',
      kind: 'activity',
      name: 'gather ICE',
      participantName: 'peer:alice',
      duration: 45,
      status: 'success',
      traceId: 'trace-1',
      spanId: 'span-1',
      timestamp: start + 120,
      logs: [
        {
          timestamp: start + 130,
          severity: 'info',
          message: 'candidate found',
          attributes: { candidateType: 'host', port: 5000 },
        },
      ],
    },
    {
      id: 'answer',
      kind: 'message',
      name: 'Answer',
      participantName: 'peer:bob',
      destination: 'peer:alice',
      messageId: 'msg-answer',
      replyTo: 'msg-offer',
      severity: 'info',
      timestamp: start + 340,
    },
    {
      id: 'note',
      kind: 'local-event',
      name: 'ICE failed',
      participantName: 'peer:alice',
      severity: 'error',
      timestamp: start + 2_400,
    },
    {
      id: 'end',
      kind: 'activation-end',
      name: 'Activation failed',
      participantName: 'peer:alice',
      severity: 'error',
      outcome: 'failed',
      timestamp: start + 2_500,
      attributes: { 'flow.error': 'IceFailure' },
    },
  ],
};

describe('makeFlowReport', () => {
  const report = makeFlowReport(flow, { copiedAt });

  test('opens with the Flow id and a summary', () => {
    expect(report.startsWith('# Flow attempt-1\n')).toBe(true);
    expect(report).toContain(
      'copied from DevTools Lotel at 2026-01-01T12:05:00.000Z',
    );
    expect(report).toContain('- Status: failed');
    expect(report).toContain('- Parent Flow: session-1');
    expect(report).toContain('- Started: 2026-01-01T12:00:00.000Z');
    expect(report).toContain(
      '- Latest: 2026-01-01T12:00:02.500Z (2.50s after start)',
    );
    expect(report).toContain('- Participants: 2');
    expect(report).toContain(
      '- Flow Items: 6 (1 activities, 2 messages, 1 local events, 1 activation starts, 1 activation ends)',
    );
    expect(report).toContain('- Warnings: 1');
  });

  test('lists every Participant with its Activations', () => {
    expect(report).toContain(
      '- peer:alice — 5 items, 1 Activation (1 failed)\n  - Activation "Connection attempt": +0.000s → +2.500s (2.50s), failed',
    );
    expect(report).toContain('- peer:bob — 1 item, no Activations');
  });

  test('lists Messages with their Reply latency', () => {
    expect(report).toContain(
      '- +0.012s peer:alice → peer:bob: "Offer" (id msg-offer)',
    );
    expect(report).toContain(
      '- +0.340s peer:bob → peer:alice: "Answer" (id msg-answer, reply to msg-offer after 328ms)',
    );
  });

  test('writes the chronological timeline with attributes and Activity logs', () => {
    expect(report).toContain(
      [
        '1. +0.000s [peer:alice] activation start "Connection attempt"',
        '2. +0.012s [peer:alice → peer:bob] message "Offer" (id msg-offer)',
        '   - sdpType: offer',
        '   - sdp: "v=0\\r\\no=- 1"',
        '3. +0.120s [peer:alice] activity "gather ICE" success 45ms (trace trace-1, span span-1)',
        '   - log +0.130s info: "candidate found"',
        '     - candidateType: host',
        '     - port: 5000',
        '4. +0.340s [peer:bob → peer:alice] message "Answer" (id msg-answer, reply to msg-offer)',
        '5. +2.400s [peer:alice] error event "ICE failed"',
        '6. +2.500s [peer:alice] activation end failed "Activation failed"',
        '   - flow.error: IceFailure',
      ].join('\n'),
    );
  });

  test('lists warnings and ends with one newline', () => {
    expect(report).toContain('## Warnings\n\n- log log-9: End without Start');
    expect(report.endsWith('\n')).toBe(true);
    expect(report.endsWith('\n\n')).toBe(false);
  });

  test('sorts Flow Items by timestamp before numbering', () => {
    const shuffled = { ...flow, items: [...flow.items].reverse() };
    expect(makeFlowReport(shuffled, { copiedAt })).toBe(report);
  });

  test('omits the Messages and Warnings sections when they are empty', () => {
    const quiet = makeFlowReport(
      {
        id: 'quiet',
        latestTimestamp: start,
        items: [],
        activations: [],
        warnings: [],
      },
      { copiedAt },
    );
    expect(quiet).not.toContain('## Messages');
    expect(quiet).not.toContain('## Warnings');
    expect(quiet).toContain('- Started: unknown (no Flow Items)');
    expect(quiet).toContain('## Participants\n\nNone.');
    expect(quiet).toContain('## Timeline\n\nNo Flow Items.');
  });
});

describe('flowStatusOf', () => {
  const activation = (
    outcome: RecordedFlow['activations'][number]['outcome'],
  ) => ({
    participantName: 'p',
    name: 'a',
    startItemId: 's',
    endItemId: outcome === null ? null : 'e',
    startTimestamp: 0,
    endTimestamp: outcome === null ? null : 1,
    outcome,
  });
  const withActivations = (
    ...outcomes: RecordedFlow['activations'][number]['outcome'][]
  ): RecordedFlow => ({
    id: 'f',
    latestTimestamp: 0,
    items: [],
    warnings: [],
    activations: outcomes.map(activation),
  });

  test('prefers failed, then active, then interrupted', () => {
    expect(flowStatusOf(undefined)).toBe('unknown');
    expect(flowStatusOf(withActivations())).toBe('completed');
    expect(flowStatusOf(withActivations('completed', 'interrupted'))).toBe(
      'interrupted',
    );
    expect(flowStatusOf(withActivations('interrupted', null))).toBe('active');
    expect(flowStatusOf(withActivations(null, 'failed'))).toBe('failed');
  });
});
