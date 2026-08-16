import { describe, expect, it } from 'vitest';
import type { RecordedFlow } from './model';
import { makeFlowLayout } from './layout';

const flowOf = (items: RecordedFlow['items']): RecordedFlow => ({
  id: 'flow',
  latestTimestamp: 0,
  items,
  activations: [],
  warnings: [],
});

describe('makeFlowLayout', () => {
  it('orders unlike items and discovers message destination lanes', () => {
    const layout = makeFlowLayout(
      flowOf([
        {
          kind: 'local-event',
          id: 'event',
          participantName: 'client-a',
          name: 'Ready',
          timestamp: 100,
          severity: 'info',
        },
        {
          kind: 'message',
          id: 'message',
          participantName: 'client-a',
          destination: 'server',
          messageId: 'm1',
          name: 'Send offer',
          timestamp: 50,
          severity: 'info',
        },
      ]),
    );

    expect(layout.participants).toEqual(['client-a', 'server']);
    expect(layout.items.map(({ id }) => id)).toEqual(['message', 'event']);
  });

  it('summarizes every globally adjacent run from one Participant', () => {
    const syncWrite = 'Replica write';
    const layout = makeFlowLayout(
      flowOf([
        {
          kind: 'local-event',
          id: 'first',
          participantName: 'global',
          name: syncWrite,
          timestamp: 1,
          severity: 'info',
        },
        {
          kind: 'local-event',
          id: 'second',
          participantName: 'global',
          name: syncWrite,
          timestamp: 2,
          severity: 'info',
        },
        {
          kind: 'local-event',
          id: 'middle',
          participantName: 'global',
          name: 'Merge',
          timestamp: 2.5,
          severity: 'info',
        },
        {
          kind: 'local-event',
          id: 'partition',
          participantName: 'partition',
          name: 'Ready',
          timestamp: 3,
          severity: 'info',
        },
        {
          kind: 'local-event',
          id: 'ready',
          participantName: 'global',
          name: 'Ready',
          timestamp: 4,
          severity: 'info',
        },
        {
          kind: 'local-event',
          id: 'third',
          participantName: 'global',
          name: syncWrite,
          timestamp: 5,
          severity: 'info',
        },
      ]),
      { collapsedSummaryIds: new Set(['first']) },
    );

    expect(
      layout.items.map(({ id, repeatCount }) => [id, repeatCount]),
    ).toEqual([
      ['first', 3],
      ['partition', 1],
      ['ready', 1],
      ['third', 1],
    ]);
    expect(layout.items[0]?.members.map(({ id }) => id)).toEqual([
      'first',
      'second',
      'middle',
    ]);
  });

  it('removes hidden Participant activity and Messages involving it', () => {
    const flow: RecordedFlow = {
      id: 'hidden-flow',
      latestTimestamp: 3,
      warnings: [],
      activations: [
        {
          participantName: 'browser/tab',
          name: 'Tab lifecycle',
          startItemId: 'tab-event',
          startTimestamp: 3,
          endItemId: null,
          endTimestamp: null,
          outcome: null,
        },
      ],
      items: [
        {
          kind: 'local-event',
          id: 'backend-event',
          participantName: 'backend',
          name: 'Ready',
          timestamp: 1,
          severity: 'info',
        },
        {
          kind: 'message',
          id: 'message',
          participantName: 'backend',
          destination: 'browser/tab',
          messageId: 'm1',
          name: 'Deliver',
          timestamp: 2,
          severity: 'info',
        },
        {
          kind: 'local-event',
          id: 'tab-event',
          participantName: 'browser/tab',
          name: 'Received',
          timestamp: 3,
          severity: 'info',
        },
      ],
    };

    const layout = makeFlowLayout(flow, {
      hiddenPaths: new Set(['browser']),
    });

    expect(layout.items.map(({ id }) => id)).toEqual(['backend-event']);
    expect(layout.activations).toEqual([]);
    expect(layout.hierarchy.columns).toMatchObject([
      { kind: 'participant', participantName: 'backend' },
      { kind: 'marker', marker: 'hidden', participantCount: 1 },
    ]);
  });
});
