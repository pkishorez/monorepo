// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Block, Scrolled, useBlocks, useScroller } from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The scroller's six rules, each as the reader meets it. jsdom lays
 * nothing out, so here every block is BLOCK tall, one under another,
 * the view VIEW tall at the top of the page, the scroll clamped to what
 * it holds, and words arriving grow the last block and tell the
 * scroller's ResizeObservers, as a browser would. It has no scroll
 * anchoring: what the browser keeps in place is seen here as the scroller
 * leaving the view alone.
 */

const BLOCK = 100;
const VIEW = 500;

let root: Root;
let container: HTMLDivElement;
let scroller: HTMLDivElement;
/** How much the last block has grown, in px. */
let grown = 0;
/** The blocks' ids, in order, as drawn. */
let ids: Array<string> = [];
/** Each ResizeObserver's callback. */
let observers: Array<() => void> = [];
let setIds: (ids: Array<string>) => void = () => {};
let holdOn: (smooth?: boolean) => void = () => {};
let still: () => void = () => {};
let toBlock: (id: string) => void = () => {};
const laidOut = Element.prototype.getBoundingClientRect;

const total = () => ids.length * BLOCK + grown;
let top = 0;
const clamp = (to: number) => Math.max(0, Math.min(to, total() - VIEW));

/** The blocks, drawn from the first `useBlocks` says, as the transcript draws its own. */
function Blocks() {
  const [order, set] = useState(ids);
  setIds = (next) => {
    ids = next;
    set(next);
  };
  const { from } = useBlocks(order);
  return order.slice(from).map((id) => (
    <Block key={id} id={id}>
      <p>{id}</p>
    </Block>
  ));
}

function List() {
  const scroll = useScroller('list', 'transcript');
  holdOn = scroll.holdOn;
  still = () => scroll.scroll.keepStill();
  toBlock = scroll.toBlock;
  return (
    <div
      ref={(element) => {
        scroll.scroller.current = element;
        if (element) scroller = element;
      }}
    >
      <div ref={scroll.content}>
        <Scrolled value={scroll.scroll}>
          <Blocks />
        </Scrolled>
      </div>
    </div>
  );
}

/** Words arriving: the last block grows by `px`. */
const grow = (px: number) =>
  act(() => {
    grown += px;
    top = clamp(top);
    for (const each of observers) each();
  });

/** A scroll by `by` px the scroller did not make: the reader's. */
const scrolled = (by: number) =>
  act(() => {
    top = clamp(top + by);
    scroller.dispatchEvent(new Event('scroll'));
  });

/** A touch on it, with no scroll, as a tap's; `lift` ends it. */
const touch = (type: 'touchstart' | 'touchend') =>
  act(() => {
    const event = new Event(type);
    Object.defineProperty(event, 'touches', { value: [] });
    scroller.dispatchEvent(event);
  });

const atBottom = () => top === total() - VIEW;

const frames = (count: number) =>
  act(async () => {
    for (let at = 0; at < count; at++)
      await new Promise((resolve) => requestAnimationFrame(resolve));
  });

/** Long enough with no scroll for the view to count as still. */
const quiet = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 200)));

beforeEach(async () => {
  grown = 0;
  top = 0;
  observers = [];
  ids = Array.from({ length: 30 }, (_, at) => `b${at}`);
  globalThis.ResizeObserver = class {
    constructor(callback: (entries: Array<never>) => void) {
      observers.push(() => callback([]));
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this === scroller)
      return DOMRect.fromRect({ x: 0, y: 0, width: 400, height: VIEW });
    const id = (this as HTMLElement).dataset?.block;
    const at = id === undefined ? -1 : ids.indexOf(id);
    if (at === -1) return laidOut.call(this);
    const height = BLOCK + (at === ids.length - 1 ? grown : 0);
    return DOMRect.fromRect({
      x: 0,
      y: at * BLOCK - top,
      width: 400,
      height,
    });
  };
  document.elementFromPoint = () => null;
  container = document.body.appendChild(document.createElement('div'));
  root = createRoot(container);
  await act(async () => root.render(<List />));
  Object.defineProperties(scroller, {
    scrollTop: {
      configurable: true,
      get: () => top,
      set: (to: number) => {
        top = clamp(to);
      },
    },
    scrollHeight: { configurable: true, get: total },
    clientHeight: { configurable: true, get: () => VIEW },
  });
  scroller.scrollTo = ((options: ScrollToOptions) => {
    top = clamp(options.top ?? top);
  }) as typeof scroller.scrollTo;
  // Opened at the bottom, as a session is.
  await grow(0);
  // Shown: from here the view is only put at a block when asked.
  await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Element.prototype.getBoundingClientRect = laidOut;
  vi.restoreAllMocks();
});

describe('the scroller', () => {
  it('1. follows what arrives while the reader is at the bottom', async () => {
    await grow(40);
    await grow(40);
    expect(atBottom()).toBe(true);
  });

  it('1. follows on as what it holds shrinks at the bottom', async () => {
    await grow(200);
    await act(() => {
      grown -= 150;
      top = clamp(top);
      scroller.dispatchEvent(new Event('scroll'));
    });
    await grow(40);
    expect(atBottom()).toBe(true);
  });

  it('2. keeps what is on the screen still as words arrive below a reader up the page', async () => {
    await scrolled(-1000);
    const was = top;
    for (let at = 0; at < 10; at++) await grow(30);
    expect(top).toBe(was);
  });

  it('2. leaves what grows above to the browser', async () => {
    await scrolled(-250);
    const was = top;
    await act(() => {
      grown += 300;
      for (const each of observers) each();
    });
    expect(top).toBe(was);
  });

  it('2. puts the view back as more is drawn above it', async () => {
    await scrolled(-total());
    expect(top).toBe(0);
    await quiet();
    const shown = container.querySelector<HTMLElement>('[data-block="b20"]')!;
    const was = shown.getBoundingClientRect().top;
    await act(async () => setIds(['a0', 'a1', 'a2', ...ids]));
    await grow(0);
    expect(shown.getBoundingClientRect().top).toBe(was);
    expect(top).toBe(3 * BLOCK);
  });

  it('2. lands back where the reader was, though the phone takes the view back', async () => {
    await scrolled(-total());
    await quiet();
    await act(async () => setIds(['a0', 'a1', 'a2', ...ids]));
    await grow(0);
    const landed = top;
    expect(landed).toBeGreaterThan(0);
    // The phone says, late, that the view is where it was before.
    await act(() => {
      top = 0;
      scroller.dispatchEvent(new Event('scroll'));
    });
    await frames(3);
    expect(top).toBe(landed);
  });

  it('2. stops landing once the view stays, and lets the reader scroll', async () => {
    await scrolled(-total());
    await quiet();
    await act(async () => setIds(['a0', 'a1', 'a2', ...ids]));
    await grow(0);
    await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
    await scrolled(-50);
    const was = top;
    await frames(3);
    expect(top).toBe(was);
  });

  it('2. lets a finger take over from landing at once', async () => {
    await scrolled(-total());
    await quiet();
    await act(async () => setIds(['a0', 'a1', 'a2', ...ids]));
    await grow(0);
    await touch('touchstart');
    await scrolled(-50);
    const was = top;
    await frames(3);
    expect(top).toBe(was);
  });

  it('holds nothing in place by the browser while following, and does once up the page', async () => {
    expect(scroller.style.overflowAnchor).toBe('none');
    await scrolled(-250);
    expect(scroller.style.overflowAnchor).toBe('');
    await scrolled(250);
    expect(scroller.style.overflowAnchor).toBe('none');
  });

  it('2. leaves the view where it is when the block it was kept by goes', async () => {
    await scrolled(-250);
    const was = top;
    // The block at the view's top, gone, as an answer's words split again.
    const kept = [
      ...container.querySelectorAll<HTMLElement>('[data-block]'),
    ].find((each) => each.getBoundingClientRect().bottom > 0)!.dataset.block!;
    await act(async () => setIds(ids.filter((id) => id !== kept)));
    await grow(0);
    expect(atBottom()).toBe(false);
    expect(Math.abs(top - was)).toBeLessThanOrEqual(BLOCK);
  });

  it('3. lets go of the bottom as the reader scrolls up a pixel or two', async () => {
    await scrolled(-2);
    const was = top;
    await grow(40);
    await grow(40);
    expect(top).toBe(was);
  });

  it('3. follows again once the reader is back at the bottom', async () => {
    await scrolled(-300);
    await scrolled(300);
    await grow(40);
    expect(atBottom()).toBe(true);
  });

  it('3. puts in place at once what changes under a tap, which moves nothing', async () => {
    await scrolled(-total());
    await quiet();
    await touch('touchstart');
    await touch('touchend');
    const shown = [
      ...container.querySelectorAll<HTMLElement>('[data-block]'),
    ].find((each) => each.getBoundingClientRect().top >= 0)!;
    const was = shown.getBoundingClientRect().top;
    await act(async () => setIds(['a0', ...ids]));
    await grow(0);
    expect(shown.getBoundingClientRect().top).toBe(was);
  });

  it('5. glides back to the bottom, lands there once quiet, and follows', async () => {
    await scrolled(-300);
    // A smooth scroll, under way: the view moves on its own, a step at a time.
    scroller.scrollTo = (() => {}) as typeof scroller.scrollTo;
    await act(() => holdOn(true));
    await scrolled(100);
    await grow(40);
    // Quiet: the rest of the way, the bottom having moved, at once.
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(atBottom()).toBe(true);
    await grow(40);
    expect(atBottom()).toBe(true);
  });

  it('5. lets the reader scroll up out of that glide', async () => {
    await scrolled(-300);
    scroller.scrollTo = (() => {}) as typeof scroller.scrollTo;
    await act(() => holdOn(true));
    await scrolled(100);
    await scrolled(-20);
    const was = top;
    await grow(40);
    expect(top).toBe(was);
  });

  it('6. goes to a block once, then leaves it to the browser', async () => {
    await act(() => toBlock('b5'));
    // A little below the view's top, as `GO_OFFSET` puts it.
    expect(top).toBe(5 * BLOCK - 16);
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const was = top;
    await grow(40);
    expect(top).toBe(was);
  });

  it('keeps what is on the screen still, at the bottom too, as a fold there opens', async () => {
    await act(() => still());
    const was = top;
    await grow(300);
    expect(top).toBe(was);
  });

  it('follows on once a fold shut at the bottom leaves the view there', async () => {
    await act(() => still());
    // It shrinks, and the browser keeps the view in what it holds.
    await act(() => {
      ids = ids.slice(0, -2);
      top = clamp(top);
      for (const each of observers) each();
      scroller.dispatchEvent(new Event('scroll'));
    });
    await grow(40);
    expect(atBottom()).toBe(true);
  });

  it('1. follows with a finger resting on it, its own scrolls no glide', async () => {
    await touch('touchstart');
    await grow(40);
    await act(() => scroller.dispatchEvent(new Event('scroll')));
    await grow(40);
    expect(atBottom()).toBe(true);
  });

  it('5. goes on gliding as words arrive, never jumping nor starting over', async () => {
    await scrolled(-300);
    const glides: Array<ScrollToOptions> = [];
    scroller.scrollTo = ((options: ScrollToOptions) =>
      void glides.push(options)) as typeof scroller.scrollTo;
    await act(() => holdOn(true));
    const was = top;
    await grow(40);
    await grow(40);
    expect(top).toBe(was);
    expect(glides).toEqual([{ top: total() - 80, behavior: 'smooth' }]);
  });
});
