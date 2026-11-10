import { describe, expect, it } from 'vitest';
import type { Row } from '../turns/rows/index.ts';
import { itemsOf } from '../turns/answer/work/live/running.tsx';

/* What runs, as the Running Picker lists it. */

type SubagentRow = Extract<Row, { readonly kind: 'subagent' }>;

const subagent = (
  id: string,
  more: Partial<SubagentRow> = {},
): SubagentRow => ({
  kind: 'subagent',
  id,
  call: {
    type: 'toolCall',
    id: `call-${id}`,
    tool: 'subagent',
    name: 'Agent',
    title: `Subagent ${id}`,
    input: {},
  },
  result: null,
  background: false,
  job: null,
  state: 'running',
  rows: [],
  startedAt: 0,
  endedAt: null,
  ...more,
});

describe('itemsOf', () => {
  it('lists running subagents, nested ones too, with their job, then jobs no row stands for', () => {
    const inner = subagent('inner');
    const rows: ReadonlyArray<Row> = [
      subagent('bg', { background: true, job: 'call-bg', rows: [inner] }),
      subagent('done', { state: 'done' }),
    ];
    const jobs = [
      {
        id: 'j1',
        kind: 'agent' as const,
        title: 'bg',
        toolCallId: 'call-bg',
        startedAt: 5,
      },
      { id: 'j2', kind: 'shell' as const, title: 'pnpm dev', startedAt: 6 },
    ];
    expect(itemsOf(rows, jobs, false, null)).toEqual([
      expect.objectContaining({
        id: 'bg',
        kind: 'agent',
        rowId: 'bg',
        jobId: 'j1',
        startedAt: 5,
      }),
      expect.objectContaining({
        id: 'j2',
        kind: 'shell',
        rowId: null,
        jobId: 'j2',
        title: 'pnpm dev',
      }),
    ]);
    // The turn running, its own subagents run too.
    expect(itemsOf(rows, jobs, true, null).map(({ id }) => id)).toEqual([
      'bg',
      'inner',
      'j2',
    ]);
  });

  it('lists a resumed subagent with the job of the call that resumed it', () => {
    const rows = [subagent('bg', { background: true, job: 'call-resume' })];
    const jobs = [
      {
        id: 'a1',
        kind: 'agent' as const,
        title: 'bg',
        toolCallId: 'call-resume',
        startedAt: 5,
      },
    ];
    expect(itemsOf(rows, jobs, false, null)).toEqual([
      expect.objectContaining({ id: 'bg', rowId: 'bg', jobId: 'a1' }),
    ]);
  });
});
