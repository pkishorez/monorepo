// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '../turns/rows/index.ts';
import { SHUT } from '../words/index.ts';
import { type Live, LiveContext } from '../turns/rows/index.ts';
import { Subagent } from '../turns/answer/work/live/subagent.tsx';
import { SubagentDrawers } from '../turns/answer/work/live/drawers.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
MotionGlobalConfig.skipAnimations = true;

/* A subagent is one line, opened whole in a drawer, and its own in one over it. */

type SubagentRow = Extract<Row, { readonly kind: 'subagent' }>;

const subagent = (
  id: string,
  title: string,
  rows: ReadonlyArray<Row>,
  more: Partial<SubagentRow> = {},
): SubagentRow => ({
  kind: 'subagent',
  id,
  call: {
    type: 'toolCall',
    id: `call-${id}`,
    tool: 'subagent',
    name: 'Agent',
    title,
    input: {},
  },
  result: null,
  background: false,
  state: 'done',
  rows,
  ...more,
});

const inner = subagent('inner', 'Check the tests', [
  { kind: 'prompt', id: 'inner:p', text: 'Run them' },
]);
const outer = subagent(
  'outer',
  'Review the diff',
  [{ kind: 'prompt', id: 'outer:p', text: 'Look it over' }, inner],
  {
    result: {
      type: 'toolResult',
      toolCallId: 'call-outer',
      output: 'All good.',
      truncated: false,
      isError: false,
    },
  },
);

const live = (more: Partial<Live> = {}): Live => ({
  jobs: [],
  stopping: [],
  depth: 0,
  open: vi.fn(),
  stop: vi.fn(),
  ...more,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('a subagent', () => {
  it('is one line that opens it, at the depth it is drawn', () => {
    const now = live({ depth: 2 });
    act(() =>
      root.render(
        <LiveContext.Provider value={now}>
          <ol>
            <Subagent row={outer} running={false} />
          </ol>
        </LiveContext.Provider>,
      ),
    );
    expect(container.textContent).toContain('Review the diff');
    expect(container.textContent).toContain('1 step');
    expect(container.textContent).not.toContain('All good.');
    act(() => container.querySelector<HTMLButtonElement>('button')!.click());
    expect(now.open).toHaveBeenCalledWith('outer', 2);
  });

  it('opens whole in a drawer, and its own subagent in one over it', () => {
    act(() =>
      root.render(
        <SubagentDrawers
          rows={[outer]}
          ids={['outer', 'inner']}
          running={false}
          opening={SHUT}
          live={live()}
          close={() => {}}
        />,
      ),
    );
    const drawers = document.querySelectorAll('[data-slot="drawer-popup"]');
    expect(drawers).toHaveLength(2);
    expect(drawers[0]!.textContent).toContain('Look it over');
    expect(drawers[0]!.textContent).toContain('All good.');
    expect(drawers[1]!.textContent).toContain('Check the tests');
    expect(drawers[1]!.textContent).toContain('Run them');
  });

  it('can be stopped from its drawer while its job runs', () => {
    const running = subagent('bg', 'Watch the build', [], {
      background: true,
      state: 'running',
    });
    const now = live({
      jobs: [
        { id: 'j1', kind: 'agent', title: 'Watch', toolCallId: 'call-bg' },
      ],
    });
    act(() =>
      root.render(
        <SubagentDrawers
          rows={[running]}
          ids={['bg']}
          running={false}
          opening={SHUT}
          live={now}
          close={() => {}}
        />,
      ),
    );
    const stop = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Stop',
    );
    act(() => stop!.click());
    expect(now.stop).toHaveBeenCalledWith('j1');
  });
});
