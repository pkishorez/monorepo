// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RunningButton,
  type RunningItem,
} from '../turns/answer/work/live/running.tsx';

/*
 * The floating button that counts what a session runs: a dot pulsing
 * softly, never a turning circle, which says only that the Turn runs;
 * "In background" beside it once the Turn has ended.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// No keys or Picker around it: only its button is read.
vi.mock(
  import('../../../../../../../../../ui/controls/picker/index.ts'),
  async (actual) => ({
    ...(await actual()),
    Frame: (({ trigger }: { readonly trigger: ReactNode }) => trigger) as never,
  }),
);

const item = (id: string, kind: RunningItem['kind']): RunningItem => ({
  id,
  kind,
  title: id,
  doing: null,
  steps: null,
  startedAt: null,
  rowId: null,
  jobId: id,
});

describe('RunningButton', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const draw = (background: boolean) =>
    act(() =>
      root.render(
        <RunningButton
          items={[item('a', 'agent'), item('b', 'shell'), item('c', 'shell')]}
          background={background}
          how={null}
          onOpen={() => {}}
          title="Running now"
        >
          {null}
        </RunningButton>,
      ),
    );

  it('pulses a dot, never turning, while the Turn runs', () => {
    draw(false);
    const button = host.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe(
      '1 subagent and 2 commands running',
    );
    expect(button.textContent).not.toContain('In background');
    expect(button.querySelector('.animate-pulse')).not.toBeNull();
    expect(button.querySelector('.animate-spin')).toBeNull();
  });

  it('says it runs In the Background once the Turn has ended', () => {
    draw(true);
    const button = host.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe(
      '1 subagent and 2 commands running in the background',
    );
    expect(button.textContent).toContain('In background');
    expect(button.querySelector('.animate-spin')).toBeNull();
  });
});
