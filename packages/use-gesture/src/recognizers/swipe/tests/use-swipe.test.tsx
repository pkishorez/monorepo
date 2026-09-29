// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GestureProvider, GestureZone } from '../../../core/zone/index.ts';
import { type Swipe, type SwipeOptions, useSwipe } from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// jsdom has no PointerEvent: a MouseEvent with a pointer id stands in.
const pointer = (type: string, id: number, x: number, y: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.assign(event, { pointerId: id, pointerType: 'touch' });
  zone().dispatchEvent(event);
};

let host: HTMLDivElement;
let root: Root;
let swipe: Swipe;

const zone = () => {
  const element = host.querySelector('[data-testid="zone"]');
  if (element === null) throw new Error('no zone');
  return element;
};

function Probe(props: SwipeOptions) {
  swipe = useSwipe(props);
  return null;
}

const render = (options: Partial<SwipeOptions> = {}) => {
  const handlers = { onStart: vi.fn(), onCommit: vi.fn(), onCancel: vi.fn() };
  act(() =>
    root.render(
      <GestureProvider>
        <GestureZone data-testid="zone">
          <Probe direction="down" {...handlers} {...options} />
        </GestureZone>
      </GestureProvider>,
    ),
  );
  return handlers;
};

// Moves finger `id` from `from` to `to` along y in `steps` moves, `ms` apart.
const drag = (id: number, x: number, from: number, to: number, ms = 16) => {
  const steps = 5;
  for (let step = 1; step <= steps; step += 1) {
    act(() => vi.advanceTimersByTime(ms));
    act(() =>
      pointer('pointermove', id, x, from + ((to - from) * step) / steps),
    );
  }
};

beforeEach(() => {
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
});

describe('useSwipe', () => {
  it('tracks one finger down and Commits on distance', () => {
    const { onStart, onCommit, onCancel } = render();
    act(() => pointer('pointerdown', 1, 50, 0));
    expect(swipe.state).toBe('possible');
    drag(1, 50, 0, 100, 60);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(swipe.state).toBe('tracking');
    expect(swipe.offset.get()).toBe(100);
    expect(swipe.progress.get()).toBeCloseTo(100 / 80);
    act(() => pointer('pointerup', 1, 50, 100));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.lastCall?.[0]).toMatchObject({ offset: 100 });
    expect(onCancel).not.toHaveBeenCalled();
    expect(swipe.state).toBe('idle');
  });

  it('Cancels when it first moves along the other axis', () => {
    const { onStart, onCancel } = render();
    act(() => pointer('pointerdown', 1, 0, 0));
    act(() => pointer('pointermove', 1, 30, 2));
    expect(onCancel).toHaveBeenCalledWith('direction', undefined);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('Cancels when it first moves the opposite way', () => {
    const { onCancel } = render();
    act(() => pointer('pointerdown', 1, 0, 100));
    act(() => pointer('pointermove', 1, 0, 80));
    expect(onCancel).toHaveBeenCalledWith('direction', undefined);
  });

  it('needs the right number of fingers as it locks', () => {
    const { onCancel, onCommit } = render({ fingers: 2 });
    act(() => pointer('pointerdown', 1, 0, 0));
    drag(1, 0, 0, 100);
    expect(onCancel).toHaveBeenCalledWith('fingers', undefined);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('follows two fingers and decides as the first lifts', () => {
    const { onCommit } = render({ fingers: 2 });
    act(() => {
      pointer('pointerdown', 1, 0, 0);
      pointer('pointerdown', 2, 40, 0);
    });
    for (let y = 20; y <= 100; y += 20) {
      act(() => vi.advanceTimersByTime(16));
      act(() => {
        pointer('pointermove', 1, 0, y);
        pointer('pointermove', 2, 40, y);
      });
    }
    expect(swipe.offset.get()).toBe(100);
    act(() => pointer('pointerup', 1, 0, 100));
    expect(onCommit).toHaveBeenCalledTimes(1);
    act(() => pointer('pointerup', 2, 40, 100));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('Cancels when a finger lands after it locks', () => {
    const { onCancel } = render();
    act(() => pointer('pointerdown', 1, 0, 0));
    drag(1, 0, 0, 40);
    act(() => pointer('pointerdown', 2, 50, 50));
    expect(onCancel).toHaveBeenCalledWith('fingers', undefined);
  });

  it('clamps at 0 when the fingers come back past the start', () => {
    const { onCancel } = render();
    act(() => pointer('pointerdown', 1, 0, 100));
    drag(1, 0, 100, 150);
    drag(1, 0, 150, 60);
    expect(swipe.offset.get()).toBe(0);
    expect(onCancel).not.toHaveBeenCalled();
    act(() => pointer('pointerup', 1, 0, 60));
    expect(onCancel.mock.lastCall?.[0]).toBe('short');
  });

  it('shows a flick stop being one while the finger rests, then Cancels', () => {
    const { onCommit, onCancel } = render({ commit: { velocity: 500 } });
    act(() => pointer('pointerdown', 1, 0, 0));
    drag(1, 0, 0, 100, 10);
    expect(swipe.willCommit.get()).toBe(true);
    expect(swipe.progress.get()).toBe(0);
    act(() => vi.advanceTimersByTime(200));
    expect(swipe.velocity.get()).toBe(0);
    expect(swipe.willCommit.get()).toBe(false);
    act(() => pointer('pointerup', 1, 0, 100));
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel.mock.lastCall?.[0]).toBe('short');
  });

  it('Commits a flick released while moving', () => {
    const { onCommit } = render({ commit: { velocity: 500 } });
    act(() => pointer('pointerdown', 1, 0, 0));
    drag(1, 0, 0, 60, 10);
    act(() => pointer('pointerup', 1, 0, 70));
    expect(onCommit).toHaveBeenCalledTimes(1);
    const [release] = onCommit.mock.lastCall as [{ projected: number }];
    expect(release.projected).toBeGreaterThan(70);
  });

  it('only hears Gestures that start where `from` asks', () => {
    const { onStart, onCancel } = render({ from: { edge: 'top', within: 24 } });
    act(() => pointer('pointerdown', 1, 0, 200));
    drag(1, 0, 200, 300);
    act(() => pointer('pointerup', 1, 0, 300));
    expect(onStart).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(swipe.state).toBe('idle');
  });

  it('Cancels as interrupted when the browser takes the touch', () => {
    const { onCancel } = render();
    act(() => pointer('pointerdown', 1, 0, 0));
    drag(1, 0, 0, 40);
    act(() => pointer('pointercancel', 1, 0, 40));
    expect(onCancel).toHaveBeenCalledWith('interrupted', undefined);
    expect(swipe.state).toBe('idle');
  });

  it('hears nothing while disabled', () => {
    const { onStart } = render({ enabled: false });
    act(() => pointer('pointerdown', 1, 0, 0));
    drag(1, 0, 0, 100);
    expect(onStart).not.toHaveBeenCalled();
    expect(swipe.state).toBe('idle');
  });
});
