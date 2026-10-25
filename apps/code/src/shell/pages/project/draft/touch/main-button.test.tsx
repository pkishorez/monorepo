// @vitest-environment jsdom
import { MotionGlobalConfig } from '@kestack/web-platform/ui/components/motion';
import { GestureProvider } from '@kestack/web-platform/ui/input';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { follow, MainButton, SEND_AT } from './main-button.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/*
 * The main button swiped up by one finger onto Send: short of it, it
 * springs back and nothing is sent; near the top it sends, buzzing once
 * as it crosses. With nothing to send it does not swipe.
 */

// jsdom has no PointerEvent: a MouseEvent with a pointer id stands in.
const pointer = (type: string, y: number) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 20,
    clientY: y,
    button: 0,
  });
  Object.assign(event, { pointerId: 1, pointerType: 'touch' });
  host.querySelector('[data-slot="dictate"]')?.dispatchEvent(event);
};

/** One finger from y 300 up by `by`, 16ms a move, then lifted. */
const swipeUp = async (by: number) => {
  act(() => pointer('pointerdown', 300));
  for (let step = 1; step <= 20; step += 1) {
    act(() => vi.advanceTimersByTime(16));
    act(() => pointer('pointermove', 300 - (by * step) / 20));
  }
  act(() => pointer('pointerup', 300 - by));
  await act(async () => vi.advanceTimersByTimeAsync(500));
};

let host: HTMLDivElement;
let root: Root;
let sent: number;
let pressed: number;
let buzzed: number;

const render = (send: string | null) =>
  act(() =>
    root.render(
      <GestureProvider>
        <MainButton
          does="dictate"
          send={send}
          disabled={false}
          onPress={() => pressed++}
          onSend={() => sent++}
        />
      </GestureProvider>,
    ),
  );

beforeEach(() => {
  MotionGlobalConfig.instantAnimations = true;
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes('reduce') || query.includes('coarse'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value: () => {
      buzzed++;
      return true;
    },
  });
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'performance'],
  });
  sent = 0;
  pressed = 0;
  buzzed = 0;
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

describe('the main button, swiped up', () => {
  it('sends once it reaches Send, buzzing once as it crosses', async () => {
    render('Send');
    await swipeUp(SEND_AT + 20);
    expect(sent).toBe(1);
    expect(buzzed).toBe(1);
    expect(pressed).toBe(0);
  });

  it('springs back short of Send, and nothing is sent', async () => {
    render('Send');
    await swipeUp(SEND_AT / 2);
    expect(sent).toBe(0);
    expect(buzzed).toBe(0);
    const moved = host.querySelector<HTMLElement>('.touch-none')!;
    expect(moved.style.transform).toMatch(/none|translateY\(0px\)|^$/);
  });

  it('does not swipe with nothing to send', async () => {
    render(null);
    await swipeUp(SEND_AT + 20);
    expect(sent).toBe(0);
    expect(host.querySelector('button[aria-label="Send"]')).toBeNull();
  });

  it('sends on a tap on Send too', async () => {
    render('Send');
    act(() =>
      host.querySelector<HTMLElement>('button[aria-label="Send"]')!.click(),
    );
    expect(sent).toBe(1);
  });

  it('follows the finger to Send, then holds back', () => {
    expect(follow(30)).toBe(30);
    expect(follow(SEND_AT)).toBe(SEND_AT);
    expect(follow(SEND_AT + 50)).toBe(SEND_AT + 10);
  });
});
