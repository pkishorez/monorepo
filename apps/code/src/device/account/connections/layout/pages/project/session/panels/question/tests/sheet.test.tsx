// @vitest-environment jsdom
import { MotionGlobalConfig } from 'motion/react';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SwipeHead } from '../dialog/sheet.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The Question Panel's sheet minimised by a swipe down its head, by the
 * Touch Layers' rule, as a Drawer is: past 80px, or a flick of 500px/s.
 * Swipes are real pointer events through its Gesture Zone.
 */

let host: HTMLDivElement;
let root: Root;
let minimised = 0;

function Sheet() {
  const sheet = useRef<HTMLDivElement>(null);
  return (
    <div ref={sheet} data-testid="sheet">
      <SwipeHead
        sheet={sheet}
        on
        onMinimise={() => void (minimised += 1)}
        className=""
      >
        <div data-testid="head" />
      </SwipeHead>
    </div>
  );
}

const sheet = () =>
  document.querySelector<HTMLElement>('[data-testid="sheet"]')!;

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
  document.querySelector('[data-testid="head"]')!.dispatchEvent(event);
};

/** One finger down from y 100 by `by` px in `moves` moves 16ms apart. */
const drag = (by: number, moves = 10) => {
  act(() => pointer('pointerdown', 100));
  for (let step = 1; step <= moves; step += 1) {
    act(() => vi.advanceTimersByTime(16));
    act(() => pointer('pointermove', 100 + (by * step) / moves));
  }
};

beforeEach(() => {
  minimised = 0;
  MotionGlobalConfig.instantAnimations = true;
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'performance'],
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Sheet />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  MotionGlobalConfig.instantAnimations = false;
});

describe('the Question Panel’s sheet', () => {
  it('follows the finger at once, and springs back when let go short and slow', () => {
    drag(60);
    expect(sheet().style.translate).toBe('0 60px');
    expect(sheet().style.transition).toBe('none');
    // Held still, so it is no flick.
    act(() => vi.advanceTimersByTime(200));
    act(() => pointer('pointerup', 160));
    expect(minimised).toBe(0);
    expect(sheet().style.translate).toBe('');
    expect(sheet().style.transition).toBe('');
  });

  it('minimises when pulled past 80px, sliding the rest by its transition', () => {
    drag(120);
    act(() => vi.advanceTimersByTime(200));
    act(() => pointer('pointerup', 220));
    expect(minimised).toBe(1);
    expect(sheet().style.translate).toBe('');
    expect(sheet().style.transition).toBe('');
  });

  it('minimises on a flick, short of 80px', () => {
    // 40px in 48ms: over 500px/s.
    drag(40, 3);
    act(() => pointer('pointerup', 140));
    expect(minimised).toBe(1);
  });
});
