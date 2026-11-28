import { describe, expect, it } from 'vitest';
import {
  agentStarted,
  cancel,
  dropped,
  result,
  sent,
  start,
} from '../index.js';

describe('TurnEnd', () => {
  it('ends on the result that answers the one message sent', () => {
    expect(result(start('a'), { user_message_uuids: ['a'] })[1]).toBe('end');
  });

  it('ends once when a steer folds into the running turn', () => {
    const state = sent(start('a'), 's');
    expect(
      result(state, {
        user_message_uuid: 's',
        user_message_uuids: ['a', 's'],
      })[1],
    ).toBe('end');
  });

  it('waits for the second result when a steer runs as its own SDK turn', () => {
    const [afterFirst, first] = result(sent(start('a'), 's'), {
      user_message_uuids: ['a'],
    });
    expect(first).toBe('continue');
    expect(result(afterFirst, { user_message_uuids: ['s'] })[1]).toBe('end');
  });

  it('counts results in order when the CLI lists no uuids', () => {
    const [afterFirst, first] = result(sent(start('a'), 's'), {});
    expect(first).toBe('continue');
    expect(result(afterFirst, {})[1]).toBe('end');
  });

  it('runs on past a result that answers only messages it never sent', () => {
    const [state, step] = result(start('a'), {
      user_message_uuids: ['someone-else'],
    });
    expect(step).toBe('continue');
    expect(state.pending).toEqual(['a']);
  });

  it('runs on past the turn Claude Code ran to report a background task first', () => {
    // A task notification and the user's message were dequeued together:
    // the notification's turn ends first, naming its origin, not a message.
    const [state, step] = result(start('a'), {
      origin: { kind: 'task-notification' },
    });
    expect(step).toBe('continue');
    expect(result(state, { user_message_uuids: ['a'] })[1]).toBe('end');
  });

  it('ends an agent-started turn at its own result', () => {
    expect(
      result(agentStarted, {
        origin: { kind: 'task-notification' },
      })[1],
    ).toBe('end');
  });

  it('keeps an agent-started turn a steer joined until the steer is answered', () => {
    const [state, step] = result(sent(agentStarted, 's'), {
      origin: { kind: 'task-notification' },
    });
    expect(step).toBe('continue');
    expect(result(state, { user_message_uuids: ['s'] })[1]).toBe('end');
  });

  it('interrupts again after a cancel while a steer is still waiting', () => {
    const state = cancel(sent(start('a'), 's'));
    const [afterFirst, first] = result(state, {
      user_message_uuids: ['a'],
    });
    expect(first).toBe('interrupt');
    expect(result(afterFirst, { user_message_uuids: ['s'] })[1]).toBe('end');
  });

  it('ends when the last waiting message is cancelled before it ran', () => {
    const [afterResult] = result(cancel(sent(start('a'), 's')), {
      user_message_uuids: ['a'],
    });
    expect(dropped(afterResult, 's')[1]).toBe('end');
    expect(dropped(afterResult, 'unknown')[1]).toBe('continue');
  });
});
