import { describe, expect, it } from 'vitest';
import { makeFlowLayout, type RecordedFlow } from './flow-presentation';

const flowOf = (items: RecordedFlow['items']): RecordedFlow => ({
  id: 'flow',
  ordering: 'recorded',
  latestTimestamp: 0,
  status: 'quiet',
  participants: [...new Set(items.map((item) => item.participantName))],
  items,
  activations: [],
  waits: [],
  warnings: [],
});

describe('makeFlowLayout', () => {
  it('keeps the Journal order and discovers message destination lanes', () => {
    const layout = makeFlowLayout(
      flowOf([
        {
          kind: 'event',
          id: 'event',
          flowId: 'flow',
          sequence: 0,
          participantName: 'client-a',
          name: 'Ready',
          timestamp: 100,
          severity: 'info',
        },
        {
          kind: 'message',
          id: 'message',
          flowId: 'flow',
          sequence: 0,
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
    expect(layout.items.map(({ id }) => id)).toEqual(['event', 'message']);
  });

  it('summarizes every globally adjacent run from one Participant', () => {
    const syncWrite = 'Replica write';
    const layout = makeFlowLayout(
      flowOf([
        {
          kind: 'event',
          id: 'first',
          flowId: 'flow',
          sequence: 0,
          participantName: 'global',
          name: syncWrite,
          timestamp: 1,
          severity: 'info',
        },
        {
          kind: 'event',
          id: 'second',
          flowId: 'flow',
          sequence: 0,
          participantName: 'global',
          name: syncWrite,
          timestamp: 2,
          severity: 'info',
        },
        {
          kind: 'event',
          id: 'middle',
          flowId: 'flow',
          sequence: 0,
          participantName: 'global',
          name: 'Merge',
          timestamp: 2.5,
          severity: 'info',
        },
        {
          kind: 'event',
          id: 'partition',
          flowId: 'flow',
          sequence: 0,
          participantName: 'partition',
          name: 'Ready',
          timestamp: 3,
          severity: 'info',
        },
        {
          kind: 'event',
          id: 'ready',
          flowId: 'flow',
          sequence: 0,
          participantName: 'global',
          name: 'Ready',
          timestamp: 4,
          severity: 'info',
        },
        {
          kind: 'event',
          id: 'third',
          flowId: 'flow',
          sequence: 0,
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

  it('places overlapping Activations on separate tracks', () => {
    const boundary = (
      id: string,
      timestamp: number,
      kind: 'activation-start' | 'activation-end',
    ): RecordedFlow['items'][number] => {
      const item = {
        id,
        flowId: 'flow',
        sequence: timestamp,
        participantName: 'alice',
        name: id,
        timestamp,
        severity: 'info' as const,
        activationId: id.replace(/-(start|end)$/, ''),
      };
      return kind === 'activation-end'
        ? { ...item, kind, outcome: 'completed' }
        : { ...item, kind };
    };
    const layout = makeFlowLayout({
      ...flowOf([
        boundary('outer-start', 1, 'activation-start'),
        boundary('nested-start', 2, 'activation-start'),
        boundary('nested-end', 3, 'activation-end'),
        boundary('outer-end', 4, 'activation-end'),
      ]),
      activations: [
        {
          activationId: 'outer',
          participantName: 'alice',
          name: 'RTC connection',
          startItemId: 'outer-start',
          endItemId: 'outer-end',
          startTimestamp: 1,
          endTimestamp: 4,
          outcome: 'completed',
        },
        {
          activationId: 'nested',
          participantName: 'alice',
          name: 'RPC GetProfile',
          startItemId: 'nested-start',
          endItemId: 'nested-end',
          startTimestamp: 2,
          endTimestamp: 3,
          outcome: 'completed',
        },
      ],
    });

    expect(layout.activations.map(({ name, track }) => [name, track])).toEqual([
      ['RTC connection', 0],
      ['RPC GetProfile', 1],
    ]);
  });

  it('removes hidden Participant activity and Messages involving it', () => {
    const flow: RecordedFlow = {
      id: 'hidden-flow',
      ordering: 'recorded',
      latestTimestamp: 3,
      status: 'quiet',
      participants: [],
      waits: [],
      warnings: [],
      activations: [
        {
          activationId: 'tab',
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
          kind: 'event',
          id: 'backend-event',
          flowId: 'flow',
          sequence: 0,
          participantName: 'backend',
          name: 'Ready',
          timestamp: 1,
          severity: 'info',
        },
        {
          kind: 'message',
          id: 'message',
          flowId: 'flow',
          sequence: 0,
          participantName: 'backend',
          destination: 'browser/tab',
          messageId: 'm1',
          name: 'Deliver',
          timestamp: 2,
          severity: 'info',
        },
        {
          kind: 'event',
          id: 'tab-event',
          flowId: 'flow',
          sequence: 0,
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
