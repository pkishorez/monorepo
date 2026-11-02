import { describe, expect, it } from 'vitest';
import { next } from '../job-list.js';

const changed = (tasks: ReadonlyArray<Record<string, unknown>>) => ({
  type: 'system',
  subtype: 'background_tasks_changed',
  tasks,
});

const bash = {
  task_id: 'b1',
  task_type: 'local_bash',
  description: 'Run the dev server',
};
const agent = {
  task_id: 'a1',
  task_type: 'local_agent',
  description: 'Review the diff',
};

describe('job list', () => {
  it('takes each snapshot as the whole list, shell and agent alike', () => {
    expect(next([], changed([bash, agent]), 5)).toEqual([
      { id: 'b1', kind: 'shell', title: 'Run the dev server', startedAt: 5 },
      { id: 'a1', kind: 'agent', title: 'Review the diff', startedAt: 5 },
    ]);
  });

  it('keeps when a job was first listed', () => {
    const first = next([], changed([bash]), 5);
    expect(next(first, changed([bash, agent]), 9)).toEqual([
      { id: 'b1', kind: 'shell', title: 'Run the dev server', startedAt: 5 },
      { id: 'a1', kind: 'agent', title: 'Review the diff', startedAt: 9 },
    ]);
  });

  it('links a job to the tool call that started it, whichever comes first', () => {
    const started = {
      type: 'system',
      subtype: 'task_started',
      task_id: 'a1',
      tool_use_id: 'toolu_1',
    };
    const after = new Map<string, string>();
    const listed = next([], changed([agent]), 5, after);
    expect(next(listed, started, 6, after)).toEqual([
      {
        id: 'a1',
        kind: 'agent',
        title: 'Review the diff',
        startedAt: 5,
        toolCallId: 'toolu_1',
      },
    ]);
    const before = new Map<string, string>();
    const told = next([], started, 5, before);
    expect(next(told, changed([agent]), 6, before)).toEqual([
      {
        id: 'a1',
        kind: 'agent',
        title: 'Review the diff',
        startedAt: 6,
        toolCallId: 'toolu_1',
      },
    ]);
  });

  it('leaves out housekeeping tasks', () => {
    expect(next([], changed([{ ...bash, ambient: true }]), 5)).toEqual([]);
  });

  it('drops a job once it ends, before the next snapshot', () => {
    const jobs = next([], changed([bash, agent]), 5);
    const notified = next(
      jobs,
      { type: 'system', subtype: 'task_notification', task_id: 'b1' },
      6,
    );
    expect(notified.map((job) => job.id)).toEqual(['a1']);
    const killed = next(
      notified,
      {
        type: 'system',
        subtype: 'task_updated',
        task_id: 'a1',
        patch: { status: 'killed' },
      },
      7,
    );
    expect(killed).toEqual([]);
  });

  it('ignores every other record', () => {
    const jobs = next([], changed([bash]), 5);
    expect(next(jobs, { type: 'assistant' }, 6)).toBe(jobs);
    expect(
      next(
        jobs,
        {
          type: 'system',
          subtype: 'task_updated',
          task_id: 'b1',
          patch: { is_backgrounded: true },
        },
        6,
      ),
    ).toBe(jobs);
  });
});
