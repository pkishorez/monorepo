import { describe, expect, it } from 'vitest';
import { finishedTurnId } from './fork-point.js';

const turn = (
  method: string,
  threadId: string,
  id: string,
  status: string,
) => ({
  method,
  params: { threadId, turn: { id, items: [], status, error: null } },
});

describe('finishedTurnId', () => {
  it('is the id of a main-thread turn that finished, however it ended', () => {
    expect(
      finishedTurnId(turn('turn/completed', 'main', 't1', 'completed'), 'main'),
    ).toBe('t1');
    expect(
      finishedTurnId(
        turn('turn/completed', 'main', 't2', 'interrupted'),
        'main',
      ),
    ).toBe('t2');
  });

  it('ignores turns that start, and sub-agent turns', () => {
    expect(
      finishedTurnId(turn('turn/started', 'main', 't1', 'inProgress'), 'main'),
    ).toBeUndefined();
    expect(
      finishedTurnId(
        turn('turn/completed', 'child', 'c1', 'completed'),
        'main',
      ),
    ).toBeUndefined();
  });
});
