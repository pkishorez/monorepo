// @vitest-environment jsdom
import { MotionGlobalConfig } from 'motion/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GestureProvider,
  GestureZone,
  useGesture,
} from '../../../core/zone/index.ts';
import { type Sidebar, type SidebarOptions, useSidebar } from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// jsdom has no PointerEvent: a MouseEvent with a pointer id stands in.
const pointer = (type: string, x: number, y = 100) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.assign(event, { pointerId: 1, pointerType: 'touch' });
  const zone = host.querySelector('[data-testid="zone"]');
  zone?.dispatchEvent(event);
};

// A second finger, landing at `x` on the zone.
const second = (type: string, x: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 300,
    button: 0,
  });
  Object.assign(event, { pointerId: 2, pointerType: 'touch' });
  host.querySelector('[data-testid="zone"]')?.dispatchEvent(event);
};

// A touch event on the zone, as iOS sends alongside the pointer events.
const touch = (type: string, x: number, y = 100) => {
  const target = host.querySelector('[data-testid="zone"]');
  const point = { identifier: 1, target, clientX: x, clientY: y };
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touches = type === 'touchend' ? [] : [point];
  Object.assign(event, { touches, changedTouches: [point] });
  target?.dispatchEvent(event);
  return event;
};

// Whether a finger landing at `x` is kept from the browser's edge swipe.
const guarded = (x: number) => {
  act(() => pointer('pointerdown', x));
  const start = touch('touchstart', x);
  act(() => pointer('pointerup', x));
  touch('touchend', x);
  return start.defaultPrevented;
};

let host: HTMLDivElement;
let root: Root;
let sidebar: Sidebar;

function Probe(props: SidebarOptions) {
  sidebar = useSidebar(props);
  return null;
}

const render = (options: Partial<SidebarOptions> = {}) => {
  const onOpenChange = vi.fn();
  act(() =>
    root.render(
      <GestureProvider>
        <GestureZone data-testid="zone">
          <Probe
            side="left"
            width={200}
            onOpenChange={onOpenChange}
            {...options}
          />
        </GestureZone>
      </GestureProvider>,
    ),
  );
  return onOpenChange;
};

// One finger from `from` to `to` along x in five moves `ms` apart, then lifted
// after resting `rest` ms.
const swipe = (from: number, to: number, ms = 16, rest = 0) => {
  act(() => pointer('pointerdown', from));
  for (let step = 1; step <= 5; step += 1) {
    act(() => vi.advanceTimersByTime(ms));
    act(() => pointer('pointermove', from + ((to - from) * step) / 5));
  }
  act(() => vi.advanceTimersByTime(rest));
  act(() => pointer('pointerup', to));
};

beforeEach(() => {
  MotionGlobalConfig.instantAnimations = true;
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'performance'],
  });
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

describe('useSidebar', () => {
  it('follows a Swipe and opens past half its width', () => {
    const onOpenChange = render();
    expect(sidebar.x.get()).toBe(-200);
    act(() => pointer('pointerdown', 10));
    for (const x of [30, 60, 90, 120, 150]) {
      act(() => vi.advanceTimersByTime(16));
      act(() => pointer('pointermove', x));
    }
    expect(sidebar.dragging).toBe(true);
    expect(sidebar.x.get()).toBe(-60);
    act(() => vi.advanceTimersByTime(200));
    act(() => pointer('pointerup', 150));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(sidebar.open).toBe(true);
    expect(sidebar.dragging).toBe(false);
  });

  it('falls back closed from a short, slow Swipe', () => {
    const onOpenChange = render();
    swipe(10, 60, 16, 200);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(sidebar.open).toBe(false);
  });

  it('opens from a short flick, carried by its momentum', () => {
    const onOpenChange = render();
    swipe(10, 80, 10);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('opens from a Swipe that starts anywhere by default', () => {
    const onOpenChange = render();
    swipe(100, 350, 16, 200);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it('opens only from its edge strip when `edge` opts in', () => {
    const onOpenChange = render({ edge: 24 });
    swipe(100, 350, 16, 200);
    expect(onOpenChange).not.toHaveBeenCalled();
    swipe(10, 250, 16, 200);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  describe('over a zone inside that wants a Swipe right', () => {
    const inner = vi.fn();

    function Tabs() {
      useGesture({ directions: ['right'], onEnd: inner });
      return null;
    }

    const renderNested = () => {
      inner.mockClear();
      const onOpenChange = vi.fn();
      act(() =>
        root.render(
          <GestureProvider>
            <GestureZone>
              <Probe side="left" width={200} onOpenChange={onOpenChange} />
              <GestureZone data-testid="zone">
                <Tabs />
              </GestureZone>
            </GestureZone>
          </GestureProvider>,
        ),
      );
      return onOpenChange;
    };

    it('opens from a Swipe that starts in its edge strip', () => {
      const onOpenChange = renderNested();
      swipe(10, 250, 16, 200);
      expect(onOpenChange).toHaveBeenCalledWith(true);
      expect(inner.mock.lastCall?.[1]).toMatchObject({ interrupted: true });
    });

    it('leaves a Swipe that starts past the strip to the zone inside', () => {
      const onOpenChange = renderNested();
      swipe(100, 350, 16, 200);
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(inner.mock.lastCall?.[1]).toMatchObject({ interrupted: false });
    });

    it('leaves a touch of more fingers in the strip to the zone inside', () => {
      const onOpenChange = renderNested();
      act(() => pointer('pointerdown', 10));
      act(() => second('pointerdown', 200));
      for (let step = 1; step <= 5; step += 1) {
        act(() => vi.advanceTimersByTime(16));
        act(() => second('pointermove', 200 + step * 30));
      }
      act(() => second('pointerup', 350));
      act(() => pointer('pointerup', 10));
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(inner.mock.lastCall?.[1]).toMatchObject({ interrupted: false });
    });
  });

  it('closes from a Swipe back anywhere while open', () => {
    const onOpenChange = render({ defaultOpen: true });
    expect(sidebar.x.get()).toBe(0);
    swipe(300, 150, 16, 200);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(sidebar.open).toBe(false);
  });

  it('works from the right edge', () => {
    const onOpenChange = render({ side: 'right', edge: 24 });
    expect(sidebar.x.get()).toBe(200);
    swipe(innerWidth - 10, innerWidth - 170, 16, 200);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  describe('at its edge', () => {
    const right = () => innerWidth - 5;

    it('keeps its side from the browser’s edge swipe, closed and open', () => {
      render();
      expect(guarded(5)).toBe(true);
      render({ open: true });
      expect(guarded(5)).toBe(true);
      expect(guarded(100)).toBe(false);
    });

    it('keeps the right side when it lives there, closed and open', () => {
      render({ side: 'right' });
      expect(guarded(right())).toBe(true);
      render({ side: 'right', open: true });
      expect(guarded(right())).toBe(true);
    });

    it('also keeps it when it opens only from an edge strip', () => {
      render({ edge: 40, open: true });
      expect(guarded(5)).toBe(true);
    });

    it('leaves the other edge to the browser while closed', () => {
      render();
      expect(guarded(right())).toBe(false);
      render({ side: 'right' });
      expect(guarded(5)).toBe(false);
    });

    it('closes from a flick that starts in the edge strip', () => {
      const onOpenChange = render({ defaultOpen: true });
      act(() => pointer('pointerdown', 20));
      expect(touch('touchstart', 20).defaultPrevented).toBe(true);
      const moves: Array<Event> = [];
      for (const x of [16, 12, 8, 4, 0]) {
        act(() => vi.advanceTimersByTime(4));
        act(() => pointer('pointermove', x));
        act(() => void moves.push(touch('touchmove', x)));
      }
      act(() => pointer('pointerup', 0));
      touch('touchend', 0);
      expect(moves.every((move) => move.defaultPrevented)).toBe(true);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(sidebar.open).toBe(false);
    });

    it('still closes from a drag after a touch in the edge strip', () => {
      const onOpenChange = render({ defaultOpen: true });
      expect(guarded(5)).toBe(true);
      swipe(300, 150, 16, 200);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('gives the edge back when it is disabled', () => {
      render({ enabled: false });
      expect(guarded(5)).toBe(false);
      render({ enabled: false, open: true });
      expect(guarded(5)).toBe(false);
    });
  });

  it('follows `open` when the app controls it', () => {
    const onOpenChange = render({ open: false });
    swipe(10, 190, 16, 200);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(sidebar.open).toBe(false);
    render({ open: true });
    expect(sidebar.open).toBe(true);
  });
});
