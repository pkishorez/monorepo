// @vitest-environment jsdom
import { MotionGlobalConfig } from 'motion/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GestureProvider, GestureZone } from '../../ui/input/index.ts';
import { SwipeRow, type SwipeRowProps } from './swipe-row.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A row swiped by one finger, as jsdom has it: 400px wide, so it commits
 * past 160px or on a flick. Swipes are real pointer events through the
 * Gesture Zones, the row's own inside the page's. Motion is reduced, so
 * a row that commits goes at once.
 */

// jsdom has no PointerEvent: a MouseEvent with a pointer id stands in.
const pointer = (type: string, x: number, y = 20) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.assign(event, { pointerId: 1, pointerType: 'touch' });
  host.querySelector('[data-testid="row"]')?.dispatchEvent(event);
};

/** One finger from x 100 to `to` (y to `toY`) in `steps` moves 16ms apart, then lifted. */
const swipe = (to: number, { steps = 10, toY = 20 } = {}) => {
  act(() => pointer('pointerdown', 100));
  for (let step = 1; step <= steps; step += 1) {
    act(() => vi.advanceTimersByTime(16));
    act(() =>
      pointer(
        'pointermove',
        100 + ((to - 100) * step) / steps,
        20 + ((toY - 20) * step) / steps,
      ),
    );
  }
  act(() => pointer('pointerup', to, toY));
};

let host: HTMLDivElement;
let root: Root;

const render = (props: Omit<SwipeRowProps, 'children'>) =>
  act(() =>
    root.render(
      <GestureProvider>
        <GestureZone>
          <SwipeRow {...props}>
            <div data-testid="row">A session</div>
          </SwipeRow>
        </GestureZone>
      </GestureProvider>,
    ),
  );

const settle = () => act(async () => vi.advanceTimersByTimeAsync(1000));

beforeEach(() => {
  MotionGlobalConfig.instantAnimations = true;
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
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

describe('SwipeRow', () => {
  it('goes past 40% of its width the way it is swiped, then calls onSwipe', async () => {
    const onSwipe = vi.fn();
    render({ direction: 'right', onSwipe, sounds: false, label: 'Settle' });
    swipe(300, { steps: 20 });
    await settle();
    expect(onSwipe).toHaveBeenCalledTimes(1);
  });

  it('springs home when let go short and slow', async () => {
    const onSwipe = vi.fn();
    render({ direction: 'right', onSwipe, sounds: false });
    swipe(200, { steps: 40 });
    await settle();
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('jumps home under reduced motion, rather than springing', async () => {
    MotionGlobalConfig.instantAnimations = false;
    render({ direction: 'right', onSwipe: () => {}, sounds: false });
    const moved = () =>
      (host.querySelector('[data-testid="row"]')!.parentElement as HTMLElement)
        .style.transform;
    swipe(200, { steps: 40 });
    // One frame after letting go: a spring would still be on its way.
    await act(async () => vi.advanceTimersByTimeAsync(20));
    expect(moved()).toBe('none');
  });

  it('goes on a fast flick, however short', async () => {
    const onSwipe = vi.fn();
    render({ direction: 'right', onSwipe, sounds: false });
    swipe(190, { steps: 5 });
    await settle();
    expect(onSwipe).toHaveBeenCalledTimes(1);
  });

  it('leaves a swipe the other way, or down, to what is around it', async () => {
    const onSwipe = vi.fn();
    render({ direction: 'right', onSwipe, sounds: false });
    swipe(-200, { steps: 5 });
    swipe(100, { steps: 5, toY: 300 });
    await settle();
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('does nothing while not enabled', async () => {
    const onSwipe = vi.fn();
    render({ direction: 'right', onSwipe, sounds: false, enabled: false });
    swipe(350, { steps: 5 });
    await settle();
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
