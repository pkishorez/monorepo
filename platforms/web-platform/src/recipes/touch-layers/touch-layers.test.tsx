// @vitest-environment jsdom
import { MotionGlobalConfig } from 'motion/react';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Drawer } from './touch-layers.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A Drawer as jsdom has it: no animations, so it has risen as soon as it
 * is drawn. Swipes are real pointer events through its Gesture Zone.
 */

let host: HTMLDivElement;
let root: Root;

const drawer = () =>
  document.querySelector<HTMLElement>('[data-slot="touch-drawer"]')!;

const settled = () => drawer().hasAttribute('data-settled');

const rise = () => act(async () => vi.advanceTimersByTimeAsync(1000));

const render = (children: ReactNode, onOpenChange = () => {}) =>
  act(() =>
    root.render(
      <Drawer open tall label="Choose" onOpenChange={onOpenChange}>
        {children}
      </Drawer>,
    ),
  );

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
  document.querySelector('[data-testid="row"]')?.dispatchEvent(event);
};

/** One finger down from y 100 by `by` px in 10 moves 16ms apart, held there. */
const drag = (by: number) => {
  act(() => pointer('pointerdown', 100));
  for (let step = 1; step <= 10; step += 1) {
    act(() => vi.advanceTimersByTime(16));
    act(() => pointer('pointermove', 100 + (by * step) / 10));
  }
};

beforeEach(() => {
  MotionGlobalConfig.instantAnimations = true;
  window.matchMedia = (query: string) =>
    ({
      matches: false,
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

describe('Drawer', () => {
  it('is Settled once risen with a field in it, moved by its transition only for transform', async () => {
    render(<input aria-label="Search" />);
    await rise();
    expect(settled()).toBe(true);
    expect(drawer().className).toContain(
      'motion-safe:data-settled:transition-transform',
    );
  });

  it('is not Settled with no field, keeping its transition', async () => {
    render(<p>A few choices</p>);
    await rise();
    expect(settled()).toBe(false);
  });

  it('is Settled when a field shown since it rose takes focus', async () => {
    render(<p>A few choices</p>);
    await rise();
    render(<input aria-label="Name" />);
    expect(settled()).toBe(false);
    act(() => document.querySelector('input')!.focus());
    expect(settled()).toBe(true);
  });

  it('follows the finger with no transition while Settled, and springs back by it when let go short', async () => {
    render(
      <div data-testid="row">
        <input aria-label="Search" />
      </div>,
    );
    await rise();
    drag(40);
    expect(drawer().style.getPropertyValue('--drawer-swipe-movement-y')).toBe(
      '40px',
    );
    expect(drawer().style.transitionDuration).toBe('0s');
    act(() => pointer('pointerup', 140));
    await rise();
    expect(drawer().style.getPropertyValue('--drawer-swipe-movement-y')).toBe(
      '0px',
    );
    expect(drawer().style.transitionDuration).toBe('');
    expect(settled()).toBe(true);
  });

  it('asks to close on a swipe past the line while Settled, sliding the rest by its transition', async () => {
    const onOpenChange = vi.fn();
    render(
      <div data-testid="row">
        <input aria-label="Search" />
      </div>,
      onOpenChange,
    );
    await rise();
    drag(200);
    act(() => pointer('pointerup', 300));
    expect(onOpenChange).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ reason: 'swipe' }),
    );
    expect(drawer().style.transitionDuration).toBe('');
  });
});
