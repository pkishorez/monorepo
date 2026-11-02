import { describe, expect, it } from 'vitest';
import { choiceOf, STOP, STOP_ALL } from '../actor.ts';

/* What each choice in the Running Picker does, from what it listed. */

const items = [
  {
    id: 'a',
    kind: 'agent' as const,
    title: 'Review the diff',
    doing: 'Reading',
    steps: 2,
    startedAt: null,
    rowId: 'a',
    jobId: 'j1',
  },
  {
    id: 'j2',
    kind: 'shell' as const,
    title: 'pnpm dev',
    doing: null,
    steps: null,
    startedAt: null,
    rowId: null,
    jobId: 'j2',
  },
];

describe('choiceOf', () => {
  it('opens a subagent, stops a command, or stops everything', () => {
    expect(choiceOf({ step: 'running', key: '', value: 'a' }, items)).toEqual({
      _tag: 'Open',
      rowId: 'a',
    });
    expect(
      choiceOf({ step: 'command', key: 'j2', value: STOP }, items),
    ).toEqual({
      _tag: 'Stop',
      jobId: 'j2',
    });
    expect(
      choiceOf({ step: 'running', key: '', value: STOP_ALL }, items),
    ).toEqual({ _tag: 'StopAll' });
  });

  it('does nothing for what has stopped since', () => {
    expect(
      choiceOf({ step: 'running', key: '', value: 'gone' }, items),
    ).toBeNull();
  });
});
