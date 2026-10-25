import { describe, expect, it } from 'vitest';
import { forkPointOf, opensTurn, toRawOut } from './records.js';

describe('records', () => {
  it('takes the main agent’s assistant and user messages as fork points', () => {
    expect(
      forkPointOf({ type: 'assistant', uuid: 'a', parent_tool_use_id: null }),
    ).toBe('a');
    expect(
      forkPointOf({ type: 'user', uuid: 'u', parent_tool_use_id: null }),
    ).toBe('u');
  });

  it('never takes a subagent’s message or a system record as a fork point', () => {
    expect(
      forkPointOf({
        type: 'assistant',
        uuid: 'a',
        parent_tool_use_id: 'toolu_1',
      }),
    ).toBe(undefined);
    expect(forkPointOf({ type: 'result', uuid: 'r' })).toBe(undefined);
    expect(forkPointOf({ type: 'system', subtype: 'init', uuid: 'i' })).toBe(
      undefined,
    );
  });

  it('opens a turn on system/init only', () => {
    expect(opensTurn({ type: 'system', subtype: 'init' })).toBe(true);
    expect(opensTurn({ type: 'system', subtype: 'task_notification' })).toBe(
      false,
    );
    expect(opensTurn({ type: 'assistant' })).toBe(false);
  });

  it('names a record by type and system subtype, and keeps the subagent id', () => {
    expect(toRawOut({ type: 'system', subtype: 'task_started' }).kind).toBe(
      'system/task_started',
    );
    expect(toRawOut({ type: 'user', parent_tool_use_id: 't' })).toMatchObject({
      kind: 'user',
      agentId: 't',
    });
  });
});
