// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '../turns/rows/index.ts';
import { SHUT } from '../words/index.ts';
import { type Live, LiveContext } from '../turns/rows/index.ts';
import { Subagent } from '../turns/answer/work/live/subagent.tsx';
import { SubagentDrawers } from '../turns/answer/work/live/drawers/drawers.tsx';
import { CommandDrawer } from '../turns/answer/work/live/drawers/command/command.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
MotionGlobalConfig.skipAnimations = true;

/* A subagent is one line, opened whole: in a dialog with a keyboard or a mouse, in drawers on a touch screen. */

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
  job: null,
  state: 'done',
  rows,
  startedAt: 0,
  endedAt: null,
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

  it('opens whole in a dialog with a keyboard or a mouse', () => {
    act(() =>
      root.render(
        <SubagentDrawers
          model={null}
          rows={[outer]}
          ids={['outer']}
          running={false}
          opening={SHUT}
          live={live()}
          close={() => {}}
        />,
      ),
    );
    expect(
      document.querySelectorAll('[data-slot="drawer-popup"]'),
    ).toHaveLength(0);
    const dialog = document.querySelector('[data-slot="dialog-content"]');
    expect(dialog?.textContent).toContain('Look it over');
    expect(dialog?.textContent).toContain('All good.');
  });

  it('shows a subagent it asked in its place, with a way back', () => {
    const close = vi.fn();
    act(() =>
      root.render(
        <SubagentDrawers
          model={null}
          rows={[outer]}
          ids={['outer', 'inner']}
          running={false}
          opening={SHUT}
          live={live()}
          close={close}
        />,
      ),
    );
    const dialogs = document.querySelectorAll('[data-slot="dialog-content"]');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]!.textContent).toContain('Check the tests');
    expect(dialogs[0]!.textContent).not.toContain('Look it over');
    act(() =>
      document
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Back to the subagent that asked it"]',
        )!
        .click(),
    );
    expect(close).toHaveBeenCalledWith(1);
  });

  it('can be stopped from where it is opened while its job runs', () => {
    const running = subagent('bg', 'Watch the build', [], {
      background: true,
      job: 'call-bg',
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
          model={null}
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

describe('a subagent’s foot', () => {
  it('says its model, its kind, its steps and the tokens it used', () => {
    const asked = subagent('typed', 'Map the jobs', [], {
      background: true,
      job: 'call-typed',
      state: 'running',
      call: {
        type: 'toolCall',
        id: 'call-typed',
        tool: 'subagent',
        name: 'Agent',
        title: 'Map the jobs',
        input: { model: 'sonnet', subagent_type: 'Explore' },
      },
    });
    const now = live({
      jobs: [
        {
          id: 'j1',
          kind: 'agent',
          title: 'Map',
          toolCallId: 'call-typed',
          tokens: 12_400,
        },
      ],
    });
    act(() =>
      root.render(
        <SubagentDrawers
          model="claude-opus-5-5"
          rows={[asked]}
          ids={['typed']}
          running={false}
          opening={SHUT}
          live={now}
          close={() => {}}
        />,
      ),
    );
    const foot = document.querySelector('footer');
    expect(foot?.textContent).toContain('Running');
    expect(foot?.textContent).toContain('Background');
    expect(foot?.textContent).toContain('sonnet');
    expect(foot?.textContent).toContain('Explore');
    expect(foot?.textContent).toContain('0 steps');
    expect(foot?.textContent).toContain('12K tokens');
  });

  it('names the session’s model when it names none, and how long it took', () => {
    act(() =>
      root.render(
        <SubagentDrawers
          model="claude-opus-5-5"
          rows={[{ ...outer, startedAt: 0, endedAt: 62_000 }]}
          ids={['outer']}
          running={false}
          opening={SHUT}
          live={live()}
          close={() => {}}
        />,
      ),
    );
    const foot = document.querySelector('footer');
    expect(foot?.textContent).toContain('Done in');
    expect(foot?.textContent).toContain('1m 02s');
    expect(foot?.textContent).toContain('claude-opus-5-5');
    expect(
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent === 'Stop',
      ),
    ).toBe(false);
  });
});

describe('a background command', () => {
  const dev = {
    kind: 'tool' as const,
    id: 'dev',
    call: {
      type: 'toolCall' as const,
      id: 'call-dev',
      tool: 'bash' as const,
      name: 'Bash',
      title: 'Start the dev server',
      input: { command: 'pnpm dev', cwd: '/Users/me/app' },
    },
    result: null,
    answered: null,
    background: true,
    job: 'call-dev',
    state: 'running' as const,
  };
  const job = {
    id: 'b1',
    kind: 'shell' as const,
    title: 'Start the dev server',
    toolCallId: 'call-dev',
  };
  const open = {
    jobId: 'b1',
    job,
    output: ['\x1b[32m  VITE\x1b[0m ready at https://code.localhost/\n'],
    dropped: 0,
    stopped: false,
    run: 1,
  };
  const draw = (now: Live, rows: ReadonlyArray<Row> = [dev]) =>
    act(() =>
      root.render(
        <LiveContext.Provider value={now}>
          <CommandDrawer command={open} rows={rows} onClose={() => {}} />
        </LiveContext.Provider>,
      ),
    );

  it('shows what it runs, where, and what it writes, in its colours', () => {
    draw(live({ jobs: [job] }));
    const dialog = document.querySelector('[data-slot="dialog-content"]');
    expect(dialog?.textContent).toContain('pnpm dev');
    expect(dialog?.textContent).toContain('~/app');
    const green = [...(dialog?.querySelectorAll('span') ?? [])].find(
      (span) => span.textContent === '  VITE',
    );
    expect(green?.className).toContain('text-green');
    expect(
      dialog?.querySelector('a[href="https://code.localhost/"]'),
    ).not.toBeNull();
    expect(document.querySelector('footer')?.textContent).toContain(
      'Started by the session',
    );
  });

  it('names the subagent that started it, and stops it from its foot', () => {
    const now = live({ jobs: [job] });
    draw(now, [subagent('helper', 'Run the app', [dev])]);
    expect(document.querySelector('footer')?.textContent).toContain(
      'Started by Run the app',
    );
    const stop = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === 'Stop',
    );
    act(() => stop!.click());
    expect(now.stop).toHaveBeenCalledWith('b1');
  });

  it('stays drawn once it has ended, with no Stop', () => {
    draw(live({ jobs: [] }));
    const foot = document.querySelector('footer');
    expect(foot?.textContent).toContain('Ended');
    expect(
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent === 'Stop',
      ),
    ).toBe(false);
    expect(
      document.querySelector('[data-slot="dialog-content"]')?.textContent,
    ).toContain('ready at');
  });
});
