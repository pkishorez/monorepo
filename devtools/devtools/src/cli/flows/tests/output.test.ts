import { describe, expect, test } from 'vitest';
import { projectJournal, type Entry, type Journal } from '@pkishorez/flow';
import { renderFlowText, simplifyFlowList } from '../output.js';

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
