// @vitest-environment jsdom
import { MotionGlobalConfig } from '@kestack/web-platform/ui/components/motion';
import {
  GestureProvider,
  GestureZone,
  useSwipe,
} from '@kestack/web-platform/ui/input';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsTab } from '../../routes/index.ts';
import { besideOf, Sliding, TabSwipe, useSlide } from './swipe.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Settings page on a touch screen, swiped sideways by one finger:
 * right to left opens the next tab, left to right the one before, and
 * left to right on the first is left to the App Shell around it, which
 * opens the sidebar. The page follows the finger, springs back from a
 * short slow drag, and once swiped away the tab opened comes in from the
 * other side. Up and down, and with no touch screen, nothing.
 */

window.matchMedia = (query: string) =>
  ({
    matches: query.includes('reduce') || query.includes('coarse'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList;

// jsdom has no PointerEvent: a MouseEvent with a pointer id stands in.
const pointer = (type: string, x: number, y: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.assign(event, { pointerId: 1, pointerType: 'touch' });
  host.querySelector('[data-testid="page"]')?.dispatchEvent(event);
};

/** One finger down at (200, 200), moved by `dx`, `dy` over 20 moves of `ms` each, still down. */
const drag = (dx: number, dy = 0, ms = 16) => {
  act(() => pointer('pointerdown', 200, 200));
  for (let step = 1; step <= 20; step += 1) {
    act(() => vi.advanceTimersByTime(ms));
    act(() =>
      pointer('pointermove', 200 + (dx * step) / 20, 200 + (dy * step) / 20),
    );
  }
};

/** The finger lifted at (200 + `dx`, 200 + `dy`). */
const lift = async (dx: number, dy = 0) => {
  act(() => pointer('pointerup', 200 + dx, 200 + dy));
  await act(async () => vi.advanceTimersByTimeAsync(500));
};

/** One finger from (200, 200) by `dx`, `dy`, 16ms a move, then lifted. */
const swipe = async (dx: number, dy = 0) => {
  drag(dx, dy);
  await lift(dx, dy);
};

/** How far the page open is moved, as the page reads it. */
let slid = () => 0;
function Probe() {
  const x = useSlide();
  slid = () => x.get();
  return null;
}

let host: HTMLDivElement;
let root: Root;
let swiped: Array<SettingsTab>;
let sidebar: number;

/** The App Shell's own swipe, from anywhere, left to right. */
function Shell() {
  useSwipe({
    direction: 'right',
    onCommit: () => {
      sidebar += 1;
    },
  });
  return null;
}

const SHOWN: ReadonlyArray<SettingsTab> = ['General', 'Machines'];

const render = (open: SettingsTab, enabled = true) =>
  act(() =>
    root.render(
      <GestureProvider>
        <GestureZone>
          <Shell />
          <TabSwipe
            open={open}
            shown={SHOWN}
            enabled={enabled}
            onSwipe={(tab) => swiped.push(tab)}
          >
            <Probe />
            <Sliding>
              <div data-testid="page" style={{ height: 800 }}>
                Settings
              </div>
            </Sliding>
          </TabSwipe>
        </GestureZone>
      </GestureProvider>,
    ),
  );

beforeEach(() => {
  MotionGlobalConfig.instantAnimations = true;
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'performance'],
  });
  swiped = [];
  sidebar = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  MotionGlobalConfig.instantAnimations = false;
});

describe('the tabs beside the one open', () => {
  it('are those shown, none past either end', () => {
    expect(besideOf(['General', 'Shortcuts', 'Machines'], 'Shortcuts')).toEqual(
      { before: 'General', after: 'Machines' },
    );
    expect(besideOf(SHOWN, 'General')).toEqual({
      before: null,
      after: 'Machines',
    });
    expect(besideOf(SHOWN, 'Machines')).toEqual({
      before: 'General',
      after: null,
    });
  });
});

describe('Settings swiped sideways on a touch screen', () => {
  it('opens the next tab right to left, and the one before left to right', async () => {
    render('General');
    await swipe(-150);
    expect(swiped).toEqual(['Machines']);
    render('Machines');
    await swipe(150);
    expect(swiped).toEqual(['Machines', 'General']);
    expect(sidebar).toBe(0);
  });

  it('follows the finger, and springs back from a short slow drag', async () => {
    render('General');
    drag(-60, 0, 40);
    expect(slid()).toBe(-60);
    await lift(-60);
    expect(swiped).toEqual([]);
    expect(slid()).toBe(0);
  });

  it('slides the page out once swiped, and the tab opened in from the other side', async () => {
    render('General');
    drag(-150);
    expect(slid()).toBe(-150);
    await lift(-150);
    expect(swiped).toEqual(['Machines']);
    expect(slid()).toBe(-innerWidth);
    render('Machines');
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(slid()).toBe(0);
  });

  it('leaves left to right on the first tab to the App Shell, which opens the sidebar', async () => {
    render('General');
    await swipe(150);
    expect(swiped).toEqual([]);
    expect(sidebar).toBe(1);
  });

  it('does nothing past the last tab, up and down, or with no touch screen', async () => {
    render('Machines');
    await swipe(-150);
    await swipe(0, -300);
    render('General', false);
    await swipe(-150);
    expect(swiped).toEqual([]);
  });
});
