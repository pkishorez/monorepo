import { describe, expect, it } from 'vitest';
import { choiceOf, STOP_ALL, written } from '../actor.ts';

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
  it('opens a subagent or a command, or stops everything', () => {
    expect(choiceOf({ step: 'running', key: '', value: 'a' }, items)).toEqual({
      _tag: 'Open',
      rowId: 'a',
    });
    expect(choiceOf({ step: 'running', key: '', value: 'j2' }, items)).toEqual({
      _tag: 'OpenCommand',
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

describe('written', () => {
  const open = {
    jobId: 'j2',
    job: { id: 'j2', kind: 'shell' as const, title: 'pnpm dev' },
    output: [],
    dropped: 0,
    stopped: false,
    run: 1,
  };

  it('keeps each piece a command wrote, in order', () => {
    expect(written(written(open, 1, 'one\n'), 1, 'two\n').output).toEqual([
      'one\n',
      'two\n',
    ]);
  });

  it('drops the oldest pieces past what it keeps, and counts them', () => {
    const big = 'x'.repeat(200 * 1024);
    const kept = written(written(written(open, 1, big), 1, big), 1, 'last\n');
    expect(kept.output).toEqual([big, 'last\n']);
    expect(kept.dropped).toBe(1);
  });

  it('starts again with the first piece of a new read', () => {
    const before = written(written(open, 1, 'one\n'), 1, 'two\n');
    expect(written(before, 2, 'one\ntwo\nthree\n')).toMatchObject({
      run: 2,
      output: ['one\ntwo\nthree\n'],
      dropped: 0,
    });
  });
});
