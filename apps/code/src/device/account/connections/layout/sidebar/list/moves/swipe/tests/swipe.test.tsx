// @vitest-environment jsdom
import { MotionGlobalConfig } from 'motion/react';
import { GestureProvider, GestureZone } from '@kestack/web-platform/ui/input';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toasts } from '../../../../../../../../../ui/controls/notice/index.ts';
import { sayMoved, SwipeBack, SwipeToMove } from '../swipe.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * A Session row on a touch screen, swiped by one finger: an unsettled one
 * left to right Settles, a Settled one right to left un-Settles, and the
 * toast's Undo moves it back. Motion is reduced, so a row that goes goes at once.
 */

const media = (touch: boolean) => (query: string) =>
  ({
    matches: query.includes('reduce') || (touch && query.includes('coarse')),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList;

// jsdom has no PointerEvent: a MouseEvent with a pointer id stands in.
const pointer = (type: string, x: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 20,
    button: 0,
  });
  Object.assign(event, { pointerId: 1, pointerType: 'touch' });
  host.querySelector('[data-testid="row"]')?.dispatchEvent(event);
};

/** One finger from x 100 to `to`, 16ms a move, then lifted. */
const swipe = async (to: number) => {
  act(() => pointer('pointerdown', 100));
  for (let step = 1; step <= 20; step += 1) {
    act(() => vi.advanceTimersByTime(16));
    act(() => pointer('pointermove', 100 + ((to - 100) * step) / 20));
  }
  act(() => pointer('pointerup', to));
  await act(async () => vi.advanceTimersByTimeAsync(500));
};

let host: HTMLDivElement;
let root: Root;
let moves: Array<boolean>;

const render = (settled: boolean) =>
  act(() =>
    root.render(
      <GestureProvider>
        <GestureZone>
          <SwipeToMove
            connectionId="m1"
            sessionId="s1"
            settled={settled}
            onMove={(to) => {
              moves.push(to);
              sayMoved('A session', to, () => moves.push(!to), 5);
            }}
          >
            <div data-testid="row">A session</div>
          </SwipeToMove>
        </GestureZone>
        <Toasts />
      </GestureProvider>,
    ),
  );

const undo = () =>
  [...document.querySelectorAll('button')].find(
    (each) => each.textContent === 'Undo',
  );

beforeEach(() => {
  MotionGlobalConfig.instantAnimations = true;
  window.matchMedia = media(true);
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'performance'],
  });
  moves = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
  vi.useRealTimers();
  MotionGlobalConfig.instantAnimations = false;
});

describe('a Session row swiped on a touch screen', () => {
  it('Settles, and Undo un-Settles it', async () => {
    render(false);
    await swipe(320);
    expect(moves).toEqual([true]);
    expect(document.body.textContent).toContain('Settled');
    act(() => undo()?.click());
    expect(moves).toEqual([true, false]);
  });

  it('un-Settles a Settled one swiped right to left, and Undo Settles it again', async () => {
    render(true);
    await swipe(320);
    // Left to right does nothing to a Settled one.
    expect(moves).toEqual([]);
    render(true);
    await swipe(-120);
    expect(moves).toEqual([false]);
    expect(document.body.textContent).toContain('Back among your sessions');
    act(() => undo()?.click());
    expect(moves).toEqual([false, true]);
  });

  it('comes back drawn afresh when its Move is refused at once, with motion', async () => {
    MotionGlobalConfig.instantAnimations = false;
    window.matchMedia = (query: string) =>
      ({
        matches: query.includes('coarse'),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList;
    // Refused as it goes, in the same render: it never leaves the list.
    function Refused() {
      const [back, setBack] = useState(0);
      return (
        <SwipeBack value={() => back}>
          <SwipeToMove
            connectionId="m1"
            sessionId="s1"
            settled={false}
            onMove={() => setBack((n) => n + 1)}
          >
            <div data-testid="row">A session</div>
          </SwipeToMove>
        </SwipeBack>
      );
    }
    act(() =>
      root.render(
        <GestureProvider>
          <GestureZone>
            <Refused />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    await swipe(320);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    const zone = host
      .querySelector('[data-testid="row"]')!
      .closest<HTMLElement>('[data-slot="gesture-zone"]')!;
    expect(zone.style.height).not.toBe('0px');
    expect(zone.style.opacity).not.toBe('0');
  });

  it('brings back only the row refused: another mid-swipe goes on, and keeps focus', async () => {
    let refuse = () => {};
    const went: Array<string> = [];
    function Rows() {
      const [refused, setRefused] = useState(0);
      refuse = () => setRefused((n) => n + 1);
      return (
        <SwipeBack value={(_, id) => (id === 'a' ? refused : 0)}>
          {['a', 'b'].map((id) => (
            <SwipeToMove
              key={id}
              connectionId="m1"
              sessionId={id}
              settled={false}
              onMove={() => void went.push(id)}
            >
              <button type="button" data-testid={`row-${id}`}>
                Session {id}
              </button>
            </SwipeToMove>
          ))}
        </SwipeBack>
      );
    }
    act(() =>
      root.render(
        <GestureProvider>
          <GestureZone>
            <Rows />
          </GestureZone>
        </GestureProvider>,
      ),
    );
    const b = () => host.querySelector<HTMLElement>('[data-testid="row-b"]')!;
    const touch = (type: string, x: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: 20,
        button: 0,
      });
      Object.assign(event, { pointerId: 1, pointerType: 'touch' });
      b().dispatchEvent(event);
    };
    const before = b();
    act(() => before.focus());
    act(() => touch('pointerdown', 100));
    for (let step = 1; step <= 10; step += 1) {
      act(() => vi.advanceTimersByTime(16));
      act(() => touch('pointermove', 100 + step * 11));
    }
    // a's Move is refused while b is halfway.
    act(() => refuse());
    expect(b()).toBe(before);
    expect(document.activeElement).toBe(before);
    for (let step = 11; step <= 20; step += 1) {
      act(() => vi.advanceTimersByTime(16));
      act(() => touch('pointermove', 100 + step * 11));
    }
    act(() => touch('pointerup', 320));
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(went).toEqual(['b']);
  });

  it('springs back, doing nothing, when let go short', async () => {
    render(false);
    await swipe(180);
    expect(moves).toEqual([]);
  });
});
