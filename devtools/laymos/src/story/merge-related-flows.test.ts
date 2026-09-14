import { describe, expect, it } from 'vitest';
import { mergeRelatedFlows } from './merge-related-flows.js';
import type { RecordedFlow } from './schema/index.js';

const flow = (
  id: string,
  timestamp: number,
  parentFlowId?: string,
): RecordedFlow => ({
  id,
  ...(parentFlowId === undefined ? {} : { parentFlowId }),
  latestTimestamp: timestamp,
  items: [
    {
      kind: 'local-event',
      id: `${id}-item`,
      participantName: 'alice',
      name: id,
      timestamp,
      severity: 'info',
    },
  ],
  activations: [],
  warnings: [],
});

describe('mergeRelatedFlows', () => {
  it('presents a parent and its descendants as one ordered Flow', () => {
    const unrelated = flow('other', 3);
    const merged = mergeRelatedFlows([
      flow('rpc', 2, 'connection'),
      unrelated,
      flow('connection', 1),
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(unrelated);
    expect(merged[1]?.id).toBe('connection');
    expect(merged[1]?.items.map(({ name }) => name)).toEqual([
      'connection',
      'rpc',
    ]);
  });
});
