import { describe, expect, it } from 'vitest';
import { turnEndOf } from '../turn-end.js';

const turn = (
  method: string,
  threadId: string,
  id: string,
  status: string,
  error: { message: string } | null = null,
) => ({
  method,
  params: { threadId, turn: { id, items: [], status, error } },
});

describe('turnEndOf', () => {
  it('is how a main-thread turn ended, with its id as the Fork Point', () => {
    expect(
      turnEndOf(turn('turn/completed', 'main', 't1', 'completed'), 'main'),
    ).toEqual({
      _tag: 'TurnEnd',
      status: 'done',
      forkPoint: 't1',
      shown: true,
    });
    expect(
      turnEndOf(turn('turn/completed', 'main', 't2', 'interrupted'), 'main'),
    ).toMatchObject({ status: 'cancelled', forkPoint: 't2' });
    expect(
      turnEndOf(
        turn('turn/completed', 'main', 't3', 'failed', {
          message: '{"error":{"message":"Too long"}}',
        }),
        'main',
      ),
    ).toMatchObject({ status: 'failed', error: 'Too long', forkPoint: 't3' });
  });

  it('ignores turns that start, and sub-agent turns', () => {
    expect(
      turnEndOf(turn('turn/started', 'main', 't1', 'inProgress'), 'main'),
    ).toBeUndefined();
    expect(
      turnEndOf(turn('turn/completed', 'child', 't1', 'completed'), 'main'),
    ).toBeUndefined();
  });
});
