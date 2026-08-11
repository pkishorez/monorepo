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
});
