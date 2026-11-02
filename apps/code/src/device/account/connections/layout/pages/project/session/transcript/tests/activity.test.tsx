// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Activity } from '../turns/answer/work/live/activity.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
MotionGlobalConfig.skipAnimations = true;

/* The line over the Draft: shown while anything runs, opening to the jobs. */

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

const review = {
  id: 'a1',
  kind: 'agent' as const,
  title: 'Review the diff',
  toolCallId: 'toolu_1',
};
const dev = { id: 'b1', kind: 'shell' as const, title: 'pnpm dev' };

const draw = (props: Partial<Parameters<typeof Activity>[0]> = {}) => {
  const onOpen = vi.fn();
  const onStop = vi.fn();
  act(() =>
    root.render(
      <Activity
        running={false}
        jobs={[]}
        stopping={[]}
        disabled={false}
        openable={(job) => job.toolCallId !== undefined}
        onOpen={onOpen}
        onStop={onStop}
        {...props}
      />,
    ),
  );
  return { onOpen, onStop };
};

describe('Activity', () => {
  it('shows nothing while nothing runs', () => {
    draw();
    expect(container.textContent).toBe('');
  });

  it('says it works while its turn runs, and what runs on in the background', () => {
    draw({ running: true, jobs: [review, dev] });
    expect(container.textContent).toContain('Working');
    expect(container.textContent).toContain('2 in the background');
  });

  it('works on while only its jobs run, opening to each with its own stop', () => {
    const { onOpen, onStop } = draw({ jobs: [review, dev] });
    expect(container.textContent).toContain('Working in the background');
    act(() => container.querySelector<HTMLButtonElement>('button')!.click());
    const items = container.querySelectorAll('li');
    expect([...items].map((item) => item.textContent)).toEqual([
      expect.stringContaining('Review the diff'),
      expect.stringContaining('pnpm dev'),
    ]);
    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Stop pnpm dev"]')!
        .click(),
    );
    expect(onStop).toHaveBeenCalledWith(dev);
    act(() => items[0]!.querySelector<HTMLButtonElement>('button')!.click());
    expect(onOpen).toHaveBeenCalledWith(review);
  });
});
