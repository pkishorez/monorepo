import { describe, expect, it } from 'vitest';
import { makeFlowLayout } from './layout';

describe('makeFlowLayout', () => {
  it('orders unlike items and discovers message destination lanes', () => {
    const layout = makeFlowLayout([
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
        name: 'Send offer',
        timestamp: 50,
        severity: 'info',
      },
    ]);

    expect(layout.participants).toEqual(['client-a', 'server']);
    expect(layout.items.map(({ id }) => id)).toEqual(['message', 'event']);
  });

  it('consolidates consecutive SoT write events within each participant lane', () => {
    const syncWrite = 'Source of Truth write';
    const layout = makeFlowLayout([
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
        id: 'partition',
        participantName: 'partition',
        name: syncWrite,
        timestamp: 2,
        severity: 'info',
      },
      {
        kind: 'local-event',
        id: 'second',
        participantName: 'global',
        name: syncWrite,
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
    ]);

    expect(
      layout.items.map(({ id, repeatCount }) => [id, repeatCount]),
    ).toEqual([
      ['first', 2],
      ['partition', 1],
      ['ready', 1],
      ['third', 1],
    ]);
    expect(layout.items[0]?.members.map(({ id }) => id)).toEqual([
      'first',
      'second',
    ]);
  });
});
