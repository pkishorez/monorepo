import { describe, expect, it } from 'vitest';
import { TurnEnd } from './index.js';

describe('TurnEnd', () => {
  it('ends on the result that answers the one message sent', () => {
    expect(
      TurnEnd.result(TurnEnd.start('a'), { user_message_uuids: ['a'] })[1],
    ).toBe('end');
  });

  it('ends once when a steer folds into the running turn', () => {
    const state = TurnEnd.sent(TurnEnd.start('a'), 's');
    expect(
      TurnEnd.result(state, {
        user_message_uuid: 's',
        user_message_uuids: ['a', 's'],
      })[1],
    ).toBe('end');
  });

  it('waits for the second result when a steer runs as its own SDK turn', () => {
    const [afterFirst, first] = TurnEnd.result(
      TurnEnd.sent(TurnEnd.start('a'), 's'),
      { user_message_uuids: ['a'] },
    );
    expect(first).toBe('continue');
    expect(TurnEnd.result(afterFirst, { user_message_uuids: ['s'] })[1]).toBe(
      'end',
    );
  });

  it('counts results in order when the CLI lists no uuids', () => {
    const [afterFirst, first] = TurnEnd.result(
      TurnEnd.sent(TurnEnd.start('a'), 's'),
      {},
    );
    expect(first).toBe('continue');
    expect(TurnEnd.result(afterFirst, {})[1]).toBe('end');
  });

  it('ignores uuids it never sent', () => {
    const [state, step] = TurnEnd.result(TurnEnd.start('a'), {
      user_message_uuids: ['someone-else'],
    });
    expect(step).toBe('end');
    expect(state.pending).toEqual([]);
  });

  it('interrupts again after a cancel while a steer is still waiting', () => {
    const state = TurnEnd.cancel(TurnEnd.sent(TurnEnd.start('a'), 's'));
    const [afterFirst, first] = TurnEnd.result(state, {
      user_message_uuids: ['a'],
    });
    expect(first).toBe('interrupt');
    expect(TurnEnd.result(afterFirst, { user_message_uuids: ['s'] })[1]).toBe(
      'end',
    );
  });

  it('ends when the last waiting message is cancelled before it ran', () => {
    const [afterResult] = TurnEnd.result(
      TurnEnd.cancel(TurnEnd.sent(TurnEnd.start('a'), 's')),
      { user_message_uuids: ['a'] },
    );
    expect(TurnEnd.dropped(afterResult, 's')[1]).toBe('end');
    expect(TurnEnd.dropped(afterResult, 'unknown')[1]).toBe('continue');
  });
});
