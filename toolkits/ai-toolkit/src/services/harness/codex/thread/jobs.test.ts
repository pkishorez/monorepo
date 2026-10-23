import { describe, expect, it } from 'vitest';
import type { BackgroundTerminal } from '../app-server/index.js';
import { makeSubAgents, terminalJobs, touchesTerminals } from './jobs.js';

const collab = (
  method: 'item/started' | 'item/completed',
  tool: string,
  receivers: ReadonlyArray<string>,
  states: Record<string, string> = {},
  prompt: string | null = null,
) => ({
  method,
  params: {
    threadId: 'main',
    turnId: 't',
    item: {
      type: 'collabAgentToolCall',
      id: `call-${tool}`,
      tool,
      status: 'completed',
      senderThreadId: 'main',
      receiverThreadIds: receivers,
      prompt,
      model: null,
      agentsStates: Object.fromEntries(
        Object.entries(states).map(([id, status]) => [
          id,
          { status, message: null },
        ]),
      ),
    },
  },
});

const turn = (
  method: 'turn/started' | 'turn/completed',
  threadId: string,
  id: string,
) => ({
  method,
  params: {
    threadId,
    turn: { id, items: [], status: 'completed', error: null },
  },
});

describe('makeSubAgents', () => {
  it('lists a spawned sub-agent by its prompt until its turn completes', () => {
    const agents = makeSubAgents('main');
    expect(
      agents.observe(
        collab(
          'item/completed',
          'spawnAgent',
          ['child'],
          { child: 'pendingInit' },
          'Find every TODO\nand list them',
        ),
        1_000,
      ),
    ).toBe(true);
    expect(agents.jobs()).toEqual([
      {
        id: 'child',
        kind: 'agent',
        title: 'Find every TODO',
        startedAt: 1_000,
      },
    ]);
    expect(agents.observe(turn('turn/started', 'child', 'ct1'), 2_000)).toBe(
      false,
    );
    expect(agents.turnOf('child')).toBe('ct1');
    expect(agents.observe(turn('turn/completed', 'child', 'ct1'), 3_000)).toBe(
      true,
    );
    expect(agents.jobs()).toEqual([]);
    expect(agents.turnOf('child')).toBeUndefined();
  });

  it('follows the states other collab calls report', () => {
    const agents = makeSubAgents('main');
    agents.observe(collab('item/completed', 'spawnAgent', ['child']), 0);
    expect(agents.jobs()).toHaveLength(1);
    expect(
      agents.observe(
        collab('item/completed', 'wait', ['child'], { child: 'completed' }),
        1,
      ),
    ).toBe(true);
    expect(agents.jobs()).toEqual([]);
  });

  it('ignores the main thread, and calls that say nothing of an unknown agent', () => {
    const agents = makeSubAgents('main');
    expect(agents.observe(turn('turn/started', 'main', 't1'), 0)).toBe(false);
    expect(
      agents.observe(collab('item/completed', 'closeAgent', ['stranger']), 0),
    ).toBe(false);
    expect(agents.jobs()).toEqual([]);
  });
});

describe('terminalJobs', () => {
  const terminal = (
    processId: string,
    command: string,
  ): BackgroundTerminal => ({
    itemId: `item-${processId}`,
    processId,
    command,
  });

  it('keeps the time each terminal was first seen, and forgets gone ones', () => {
    const seen = new Map<string, number>();
    expect(terminalJobs([terminal('1', 'sleep 30')], seen, 10)).toEqual([
      { id: '1', kind: 'shell', title: 'sleep 30', startedAt: 10 },
    ]);
    expect(
      terminalJobs(
        [terminal('1', 'sleep 30'), terminal('2', 'npm run dev\n# watch')],
        seen,
        20,
      ),
    ).toEqual([
      { id: '1', kind: 'shell', title: 'sleep 30', startedAt: 10 },
      { id: '2', kind: 'shell', title: 'npm run dev', startedAt: 20 },
    ]);
    expect(terminalJobs([], seen, 30)).toEqual([]);
    expect(seen.size).toBe(0);
  });
});

describe('touchesTerminals', () => {
  it('is true for command items and finished turns only', () => {
    const item = (type: string) => ({
      method: 'item/started',
      params: { threadId: 'main', turnId: 't', item: { type, id: 'i' } },
    });
    expect(touchesTerminals(item('commandExecution'))).toBe(true);
    expect(touchesTerminals(item('agentMessage'))).toBe(false);
    expect(touchesTerminals(turn('turn/completed', 'main', 't'))).toBe(true);
  });
});
