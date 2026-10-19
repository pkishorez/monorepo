import { Effect, Layer, Queue, Stream } from 'effect';
import { Keyboard } from '../capabilities/keyboard.ts';
import type { Press } from '../capabilities/keyboard.ts';

/*
 * The browser's Keyboard, and the lock that decides when the page hands
 * the game its keys. Whoever shows the game turns the lock: the docs'
 * window while the game is in view, the recording for as long as it is
 * open. While locked, the game's keys go to the game alone, and every
 * other key to the page; Esc gives them all back. The lock opening is a
 * Press of its own, so a running game pauses.
 */

const KEYS: Record<string, Press> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  ' ': 'space',
};

let locked = false;
const listeners = new Set<() => void>();

export const keyLock = {
  get locked() {
    return locked;
  },
  set: (on: boolean) => {
    if (on === locked) return;
    locked = on;
    for (const listener of listeners) listener();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Typing in a field keeps its keys, lock or not. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Each Worker that reads it adds its own listeners, gone when its Scope closes. */
export const BrowserKeyboard = Layer.succeed(Keyboard, {
  presses: Stream.callback<Press>((queue) => {
    const onKey = (event: KeyboardEvent) => {
      if (!locked || event.metaKey || event.ctrlKey || event.altKey) return;
      if (typing(event.target)) return;
      if (event.key === 'Escape') return keyLock.set(false);
      const press = KEYS[event.key];
      if (!press) return;
      event.preventDefault();
      if (!event.repeat) Queue.offerUnsafe(queue, press);
    };
    const onLock = () => {
      if (!locked) Queue.offerUnsafe(queue, 'away');
    };
    return Effect.acquireRelease(
      Effect.sync(() => {
        window.addEventListener('keydown', onKey);
        return keyLock.subscribe(onLock);
      }),
      (unsubscribe) =>
        Effect.sync(() => {
          window.removeEventListener('keydown', onKey);
          unsubscribe();
        }),
    );
  }),
});
