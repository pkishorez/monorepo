import { describe, expect, it } from 'vitest';
import { makeLineage } from '../lineage.js';

const collab = (
  method: 'item/started' | 'item/completed',
  id: string,
  tool: string,
  sender: string,
  receivers: ReadonlyArray<string>,
) => ({
  method,
  params: {
    threadId: sender,
    turnId: 't',
    item: {
      type: 'collabAgentToolCall',
      id,
      tool,
      status: 'completed',
      senderThreadId: sender,
      receiverThreadIds: receivers,
      prompt: null,
      model: null,
      agentsStates: {},
    },
  },
});

describe('makeLineage', () => {
  it('keeps the main thread as the main agent', () => {
    expect(makeLineage('main').agentOf('main')).toBeUndefined();
  });

  it('names a spawned thread by the spawning call, recursively', () => {
    const lineage = makeLineage('main');
    lineage.observe(
      collab('item/started', 'spawn-1', 'spawnAgent', 'main', []),
    );
    lineage.observe(
      collab('item/completed', 'spawn-1', 'spawnAgent', 'main', ['child']),
    );
    lineage.observe(
      collab('item/completed', 'spawn-2', 'spawnAgent', 'child', [
        'grandchild',
      ]),
    );
    expect(lineage.agentOf('child')).toBe('spawn-1');
    expect(lineage.agentOf('grandchild')).toBe('spawn-2');
  });

  it('does not let a later wait or message re-parent a spawned thread', () => {
    const lineage = makeLineage('main');
    lineage.observe(
      collab('item/completed', 'spawn-1', 'spawnAgent', 'main', ['child']),
    );
    lineage.observe(
      collab('item/completed', 'wait-1', 'wait', 'main', ['child']),
    );
    expect(lineage.agentOf('child')).toBe('spawn-1');
  });

  it('adopts a thread first reached by a non-spawn call (resumed after restart)', () => {
    const lineage = makeLineage('main');
    lineage.observe(
      collab('item/completed', 'resume-1', 'resumeAgent', 'main', [
        'old-child',
      ]),
    );
    expect(lineage.agentOf('old-child')).toBe('resume-1');
  });

  it('keeps an unknown thread off the main agent', () => {
    expect(makeLineage('main').agentOf('stranger')).toBe('stranger');
  });
});
