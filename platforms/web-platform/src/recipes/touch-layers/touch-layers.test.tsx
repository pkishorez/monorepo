// @vitest-environment jsdom
import { MotionGlobalConfig } from 'motion/react';
import { act, type ReactNode, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Drawer } from './touch-layers.tsx';
import { useKeyboardOver, useVisibleViewport } from './visible-viewport.ts';

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

/*
 * A focused field kept in sight in its layer, by what the browser says:
 * once as it takes focus, and again only as the layer's room shrinks. A
 * stand-in `visualViewport` says what can be seen; the field sits 50px
 * below its scroller's foot, so each reveal scrolls it by 50.
 */
describe('a focused field in a layer', () => {
  const viewport = Object.assign(new EventTarget(), {
    offsetTop: 0,
    pageTop: 0,
    height: 714,
    scale: 1,
  });
  const rect = (top: number, bottom: number) =>
    ({
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height: bottom - top,
    }) as DOMRect;

  beforeEach(() => {
    viewport.height = 714;
    Object.defineProperty(window, 'visualViewport', {
      value: viewport,
      configurable: true,
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'visualViewport');
  });

  /** A scroller 100px tall holding more than that, a field past its foot. */
  const Scroller = () => (
    <div
      data-testid="scroller"
      style={{ overflowY: 'auto' }}
      ref={(element) => {
        if (element === null) return;
        Object.defineProperty(element, 'scrollHeight', { value: 400 });
        Object.defineProperty(element, 'clientHeight', { value: 100 });
        element.getBoundingClientRect = () => rect(500, 600);
      }}
    >
      <input
        aria-label="Name"
        ref={(element) => {
          if (element !== null)
            element.getBoundingClientRect = () => rect(620, 650);
        }}
      />
    </div>
  );
  const scrolled = () =>
    document.querySelector<HTMLElement>('[data-testid="scroller"]')!.scrollTop;
  const say = (type: string, height = viewport.height) =>
    act(() => {
      viewport.height = height;
      viewport.dispatchEvent(new Event(type));
    });

  function Fixed() {
    const layer = useRef<HTMLDivElement>(null);
    return (
      <div ref={layer} style={useVisibleViewport(true, layer)}>
        <Scroller />
      </div>
    );
  }

  function InPage() {
    const box = useRef<HTMLDivElement>(null);
    const layer = useRef<HTMLDivElement>(null);
    const over = useKeyboardOver(true, box, layer);
    return (
      <div
        ref={(element) => {
          box.current = element;
          if (element !== null)
            element.getBoundingClientRect = () => rect(500, 714);
        }}
      >
        <div ref={layer} style={{ paddingBottom: over.covered }}>
          <Scroller />
        </div>
      </div>
    );
  }

  it.each([
    ['fixed to the page', <Fixed />],
    ['placed in the page', <InPage />],
  ])(
    '%s, is scrolled into sight as it takes focus, and as the keyboard takes room, only then',
    (_, layer) => {
      act(() => root.render(layer));
      expect(scrolled()).toBe(0);
      act(() => document.querySelector('input')!.focus());
      expect(scrolled()).toBe(50);
      // Panned or resized to the same: nothing moves.
      say('scroll');
      say('resize');
      expect(scrolled()).toBe(50);
      // The keyboard rises: the layer has less room.
      say('resize', 400);
      expect(scrolled()).toBe(100);
      // And falls: more room, nothing moves.
      say('resize', 714);
      expect(scrolled()).toBe(100);
      // Nothing is left to read later.
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('is left alone outside the layer', () => {
    act(() =>
      root.render(
        <>
          <Fixed />
          <input aria-label="Elsewhere" />
        </>,
      ),
    );
    act(() =>
      document.querySelector<HTMLElement>('[aria-label="Elsewhere"]')!.focus(),
    );
    say('resize', 400);
    expect(scrolled()).toBe(0);
  });
});
