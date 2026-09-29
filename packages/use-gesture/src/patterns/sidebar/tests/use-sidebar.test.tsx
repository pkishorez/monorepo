// @vitest-environment jsdom
import { MotionGlobalConfig } from 'motion/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GestureProvider, GestureZone } from '../../../core';
import { type Sidebar, type SidebarOptions, useSidebar } from '..';

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
  it('follows a Swipe from its edge and opens past half its width', () => {
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

  it('opens only from a Swipe that starts at its edge', () => {
    const onOpenChange = render();
    swipe(100, 350, 16, 200);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes from a Swipe back anywhere while open', () => {
    const onOpenChange = render({ defaultOpen: true });
    expect(sidebar.x.get()).toBe(0);
    swipe(300, 150, 16, 200);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(sidebar.open).toBe(false);
  });

  it('works from the right edge', () => {
    const onOpenChange = render({ side: 'right' });
    expect(sidebar.x.get()).toBe(200);
    swipe(innerWidth - 10, innerWidth - 170, 16, 200);
    expect(onOpenChange).toHaveBeenCalledWith(true);
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
