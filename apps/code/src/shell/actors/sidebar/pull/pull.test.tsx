// @vitest-environment jsdom
import { MotionGlobalConfig } from '@kestack/web-platform/ui/components/motion';
import { GestureProvider, GestureZone } from '@kestack/web-platform/ui/input';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwipeToMove } from '../swipe/swipe.tsx';
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

// The list scrolls, and each Session row in it is swiped to Settle, in
// its own zone, as the sidebar's are.
function List() {
  useReload(() => void reloads++);
  return (
    <div data-testid="scroller" style={{ overflowY: 'auto' }}>
      <div data-testid="list">Projects</div>
      <SwipeToMove
        machineId="m1"
        sessionId="s1"
        settled={false}
        onMove={() => {}}
      >
        <div data-testid="session">A Session</div>
      </SwipeToMove>
    </div>
  );
}

// jsdom has no Touch: plain events carry the touch lists instead.
const touch = (type: string, target: Element, y: number) => {
  const point = { identifier: 1, target, clientX: 100, clientY: y };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    touches: type === 'touchend' ? [] : [point],
    changedTouches: [point],
  });
  target.dispatchEvent(event);
  return event;
};

/** A finger pulling down `to` px on a Session row, as the browser sends it. */
const pullOnSession = (to: number) => {
  const session = host.querySelector('[data-testid="session"]')!;
  const at = (type: string, y: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: y,
      button: 0,
    });
    Object.assign(event, { pointerId: 1, pointerType: 'touch' });
    session.dispatchEvent(event);
  };
  act(() => {
    at('pointerdown', 0);
    touch('touchstart', session, 0);
  });
  let first: Event | undefined;
  for (let step = 1; step <= 10; step += 1) {
    act(() => vi.advanceTimersByTime(16));
    act(() => {
      at('pointermove', (to * step) / 10);
      const move = touch('touchmove', session, (to * step) / 10);
      first ??= move;
    });
  }
  act(() => {
    at('pointerup', to);
    touch('touchend', session, to);
  });
  return first;
};

const scrolledTo = (top: number) => {
  const scroller = host.querySelector<HTMLElement>('[data-testid="scroller"]')!;
  Object.defineProperties(scroller, {
    scrollHeight: { value: 1000, configurable: true },
    clientHeight: { value: 400, configurable: true },
  });
  scroller.scrollTop = top;
};

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

  it('leaves a pull on a Session row to the list while it is scrolled down', async () => {
    scrolledTo(200);
    const move = pullOnSession(200);
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(move?.defaultPrevented).toBe(false);
    expect(reloads).toBe(0);
  });

  it('reloads from a pull on a Session row once the list is at its top', async () => {
    scrolledTo(0);
    const move = pullOnSession(200);
    await act(async () => {});
    expect(move?.defaultPrevented).toBe(true);
    expect(reloads).toBe(1);
  });

  it('does nothing when let go short of it', async () => {
    pull(60);
    await act(async () => vi.advanceTimersByTimeAsync(800));
    expect(reloads).toBe(0);
  });
});
