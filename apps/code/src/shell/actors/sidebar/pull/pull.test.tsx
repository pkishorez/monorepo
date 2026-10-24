// @vitest-environment jsdom
import { MotionGlobalConfig } from '@kestack/web-platform/ui/components/motion';
import { GestureProvider, GestureZone } from '@kestack/web-platform/ui/input';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PullToReload, useReload } from './pull.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The sidebar on a touch screen, pulled down from its top: past the mark
 * it Reloads, with a spinner until the list has been asked again; short
 * of it, nothing happens.
 */

window.matchMedia = (query: string) =>
  ({
    matches: query.includes('coarse'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList;

// jsdom has no PointerEvent: a MouseEvent with a pointer id stands in.
const pointer = (type: string, y: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: y,
    button: 0,
  });
  Object.assign(event, { pointerId: 1, pointerType: 'touch' });
  host.querySelector('[data-testid="list"]')?.dispatchEvent(event);
};

const pull = (to: number) => {
  act(() => pointer('pointerdown', 0));
  for (let step = 1; step <= 10; step += 1) {
    act(() => vi.advanceTimersByTime(16));
    act(() => pointer('pointermove', (to * step) / 10));
  }
  act(() => pointer('pointerup', to));
};

let host: HTMLDivElement;
let root: Root;
let reloads = 0;

function List() {
  useReload(() => void reloads++);
  return <div data-testid="list">Projects</div>;
}

const reloading = () =>
  host.querySelector('[aria-label="Reloading the Machines"]') !== null;

beforeEach(() => {
  MotionGlobalConfig.instantAnimations = true;
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'performance'],
  });
  reloads = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <GestureProvider>
        <GestureZone>
          <PullToReload>
            <List />
          </PullToReload>
        </GestureZone>
      </GestureProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  MotionGlobalConfig.instantAnimations = false;
});

describe('Pull to Reload', () => {
  it('reloads past the mark, spinning until the list is asked again', async () => {
    pull(200);
    await act(async () => {});
    expect(reloads).toBe(1);
    expect(reloading()).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(reloading()).toBe(false);
  });

  it('does nothing when let go short of it', async () => {
    pull(60);
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(reloads).toBe(0);
  });
});
