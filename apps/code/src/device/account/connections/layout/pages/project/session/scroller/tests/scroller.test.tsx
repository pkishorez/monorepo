// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Block, Scrolled, useBlocks, useScroller } from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The scroller keeps the reader's place as what it holds changes. jsdom
 * lays nothing out, so here every block is BLOCK tall, one under another,
 * the view VIEW tall at the top of the page, the scroll clamped to what
 * it holds, and words arriving grow the last block and tell the
 * scroller's ResizeObservers, as a browser would.
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

/** The reader's own scroll by `by` px, as after a wheel's turn. */
const wheel = (by: number) =>
  act(() => {
    scroller.dispatchEvent(new Event('wheel'));
    top = clamp(top + by);
    scroller.dispatchEvent(new Event('scroll'));
  });

/** A scroll by `by` px with nothing of the reader's before it. */
const moved = (by: number) =>
  act(() => {
    top = clamp(top + by);
    scroller.dispatchEvent(new Event('scroll'));
  });

const atBottom = () => top === total() - VIEW;

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
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Element.prototype.getBoundingClientRect = laidOut;
  vi.restoreAllMocks();
});

describe('the scroller', () => {
  it('follows words arriving while the reader is at the bottom', async () => {
    expect(atBottom()).toBe(true);
    await grow(40);
    await grow(40);
    expect(atBottom()).toBe(true);
  });

  it('lets go of the bottom as soon as the reader scrolls up, however little', async () => {
    await wheel(-10);
    const was = top;
    await grow(40);
    await grow(40);
    expect(top).toBe(was);
  });

  it('follows again once the reader scrolls back down near the bottom', async () => {
    await wheel(-300);
    await wheel(290);
    await grow(40);
    expect(atBottom()).toBe(true);
  });

  it('keeps a held pointer’s slow drag up, as on the scrollbar, past a second', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    await act(() => {
      scroller.dispatchEvent(new Event('pointerdown'));
    });
    now.mockReturnValue(4000);
    await moved(-10);
    const was = top;
    await grow(40);
    expect(top).toBe(was);
    await act(() => {
      window.dispatchEvent(new Event('pointerup'));
    });
  });

  it('puts back a scroll up that was not the reader’s, as what it holds shrinks', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(10_000);
    await moved(-10);
    await grow(40);
    expect(atBottom()).toBe(true);
  });

  it('keeps what is on the screen still as words arrive below a reader up the page', async () => {
    await wheel(-1000);
    const was = top;
    for (let at = 0; at < 10; at++) await grow(30);
    expect(top).toBe(was);
  });

  it('leaves the view where it is when the block it was kept by goes', async () => {
    await wheel(-250);
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

  /** Clicks `id`'s block, after a tap's touch when `tapped`, then what is above it goes. */
  const shutAbove = async (id: string, above: string, tapped: boolean) => {
    const clicked = container.querySelector<HTMLElement>(
      `[data-block="${id}"]`,
    )!;
    const was = clicked.getBoundingClientRect().top;
    await act(() => {
      if (tapped)
        for (const type of ['touchstart', 'touchend']) {
          const touch = new Event(type);
          Object.defineProperty(touch, 'touches', { value: [] });
          scroller.dispatchEvent(touch);
        }
      clicked.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 1 }),
      );
    });
    await act(async () => setIds(ids.filter((each) => each !== above)));
    await grow(0);
    return { was, now: clicked.getBoundingClientRect().top };
  };

  it('keeps what was clicked where it was as what is above it shuts', async () => {
    await wheel(-250);
    const { was, now } = await shutAbove('b27', 'b26', false);
    expect(now).toBe(was);
  });

  it('does so at once after a tap, which is not a glide', async () => {
    await wheel(-250);
    const { was, now } = await shutAbove('b27', 'b26', true);
    expect(now).toBe(was);
  });

  it('glides back to the bottom on a send, though the reader scrolled up just before', async () => {
    await wheel(-300);
    // A smooth scroll, under way: the view moves on its own, a step at a time.
    scroller.scrollTo = (() => {}) as typeof scroller.scrollTo;
    await act(() => holdOn(true));
    await moved(100);
    await grow(40);
    expect(atBottom()).toBe(true);
  });
});
