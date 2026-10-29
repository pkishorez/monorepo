// @vitest-environment jsdom
import { MotionGlobalConfig, type MotionValue } from 'motion/react';
import {
  GestureProvider,
  GestureZone,
  useSwipe,
} from '@kestack/web-platform/ui/input';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { besideOf, TabTrack } from '../track.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * Tabs on a touch screen, side by side, swiped sideways by one finger:
 * right to left opens the next tab, left to right the one before, and left
 * to right on the first is left to the App Shell around it, which opens
 * the sidebar. The track follows the finger, so the tab beside shows,
 * springs back from a short slow drag, and once another tab is open,
 * swiped to or tapped, slides from where it was to it. Up and down,
 * nothing.
 */

type SettingsTab = 'General' | 'Shortcuts' | 'Connections';

let reduce = false;
window.matchMedia = (query: string) =>
  ({
    matches: query.includes('reduce') ? reduce : query.includes('coarse'),
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
  host
    .querySelector('[data-testid="page"]:not([inert] *)')
    ?.dispatchEvent(event);
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

// Motion moves on the browser's frames, which the fake clock does not drive.
const later = globalThis.setTimeout;

/** Every animation under way run to its end. */
const settled = () =>
  act(async () => {
    for (let frame = 0; frame < 3; frame += 1) {
      await new Promise((done) => later(done, 20));
      await vi.advanceTimersByTimeAsync(200);
    }
  });

/** The finger lifted at (200 + `dx`, 200 + `dy`). */
const lift = async (dx: number, dy = 0) => {
  act(() => pointer('pointerup', 200 + dx, 200 + dy));
  await settled();
};

/** One finger from (200, 200) by `dx`, `dy`, 16ms a move, then lifted. */
const swipe = async (dx: number, dy = 0) => {
  drag(dx, dy);
  await lift(dx, dy);
};

let host: HTMLDivElement;
let root: Root;
let swiped: Array<SettingsTab>;
let slid: { current: MotionValue<number> | null };
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

const SHOWN: ReadonlyArray<SettingsTab> = ['General', 'Connections'];

/** How far the track is moved off the tab open, in px. */
const moved = () => slid.current?.get() ?? 0;

/** Settings' tabs, `open` open. */
const render = (open: SettingsTab) =>
  act(() =>
    root.render(
      <GestureProvider>
        <GestureZone>
          <Shell />
          <TabTrack
            open={open}
            shown={SHOWN}
            heading={null}
            panel={(tab) => (
              <div data-testid="page" style={{ height: 800 }}>
                {tab}
              </div>
            )}
            onChoose={(tab) => swiped.push(tab)}
            slid={slid}
          />
        </GestureZone>
      </GestureProvider>,
    ),
  );

// One clock for every test: Motion keeps the time of its last frame.
beforeAll(() => {
  MotionGlobalConfig.instantAnimations = true;
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'performance'],
  });
});

afterAll(() => {
  vi.useRealTimers();
  MotionGlobalConfig.instantAnimations = false;
});

beforeEach(() => {
  reduce = false;
  swiped = [];
  slid = { current: null };
  sidebar = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the tabs beside the one open', () => {
  it('are those shown, none past either end', () => {
    expect(
      besideOf(['General', 'Shortcuts', 'Connections'], 'Shortcuts'),
    ).toEqual({ before: 'General', after: 'Connections' });
    expect(besideOf(SHOWN, 'General')).toEqual({
      before: null,
      after: 'Connections',
    });
    expect(besideOf(SHOWN, 'Connections')).toEqual({
      before: 'General',
      after: null,
    });
  });
});

describe('Settings swiped sideways on a touch screen', () => {
  it('draws every tab shown, only the one open taking a touch or a key', () => {
    render('General');
    const pages = [...host.querySelectorAll('[data-testid="page"]')];
    expect(pages.map((page) => page.textContent)).toEqual([
      'General',
      'Connections',
    ]);
    expect(pages.map((page) => page.closest('[inert]') !== null)).toEqual([
      false,
      true,
    ]);
  });

  it('opens the next tab right to left, and the one before left to right', async () => {
    render('General');
    await swipe(-150);
    expect(swiped).toEqual(['Connections']);
    render('Connections');
    await swipe(150);
    expect(swiped).toEqual(['Connections', 'General']);
    expect(sidebar).toBe(0);
  });

  it('opens the tab beside past a fifth of the width, or flicked, however short', async () => {
    render('General');
    drag(-(innerWidth * 0.2 + 4), 0, 60);
    await lift(-(innerWidth * 0.2 + 4));
    expect(swiped).toEqual(['Connections']);
    render('Connections');
    render('General');
    await settled();
    drag(-40, 0, 4);
    await lift(-40);
    expect(swiped).toEqual(['Connections', 'Connections']);
  });

  it('follows the finger, and springs back from a short slow drag', async () => {
    render('General');
    drag(-60, 0, 40);
    expect(moved()).toBe(-60);
    await lift(-60);
    expect(swiped).toEqual([]);
    expect(moved()).toBe(0);
  });

  it('slides on from where the finger left it to the tab opened', async () => {
    render('General');
    drag(-150);
    expect(moved()).toBe(-150);
    await lift(-150);
    expect(swiped).toEqual(['Connections']);
    expect(moved()).toBe(-150);
    render('Connections');
    expect(moved()).toBe(innerWidth - 150);
    await settled();
    expect(moved()).toBe(0);
  });

  it('slides to a tab tapped by its name from the one open', async () => {
    render('General');
    render('Connections');
    expect(moved()).toBe(innerWidth);
    await settled();
    expect(moved()).toBe(0);
    expect(
      host.querySelector('[data-testid="page"]:not([inert] *)')?.textContent,
    ).toBe('Connections');
  });

  it('follows the finger under reduced motion, but jumps where it goes', async () => {
    reduce = true;
    render('General');
    drag(-60, 0, 40);
    expect(moved()).toBe(-60);
    act(() => pointer('pointerup', 140, 200));
    expect(moved()).toBe(0);
    render('Connections');
    expect(moved()).toBe(0);
  });

  it('leaves left to right on the first tab to the App Shell, which opens the sidebar', async () => {
    render('General');
    await swipe(150);
    expect(swiped).toEqual([]);
    expect(sidebar).toBe(1);
  });

  it('does nothing past the last tab, or up and down', async () => {
    render('Connections');
    await swipe(-150);
    await swipe(0, -300);
    expect(swiped).toEqual([]);
  });
});
