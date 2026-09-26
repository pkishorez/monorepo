import * as Effect from 'effect/Effect';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { isBrowser, listen } from './dom-events.js';
import type { DisplayModeValue } from './states.js';

// Most specific first: a window-controls-overlay app also matches nothing else.
const INSTALLED_MODES = [
  'fullscreen',
  'window-controls-overlay',
  'standalone',
  'minimal-ui',
] as const;

const query = (mode: DisplayModeValue) =>
  window.matchMedia(`(display-mode: ${mode})`);

/** `navigator.standalone` covers iOS Safari, which has no display-mode media query for home-screen apps before 16.4. */
export const readDisplayMode = (): DisplayModeValue => {
  if (!isBrowser()) return 'browser';
  if (typeof window.matchMedia === 'function') {
    const match = INSTALLED_MODES.find((mode) => query(mode).matches);
    if (match !== undefined) return match;
  }
  return (navigator as { readonly standalone?: boolean }).standalone === true
    ? 'standalone'
    : 'browser';
};

export const makeDisplayMode = Effect.gen(function* () {
  const mode = yield* SubscriptionRef.make(readDisplayMode());
  if (isBrowser() && typeof window.matchMedia === 'function') {
    const refresh = () =>
      Effect.runSync(SubscriptionRef.set(mode, readDisplayMode()));
    for (const value of INSTALLED_MODES) {
      yield* listen(query(value), 'change', refresh);
    }
  }
  return { mode };
});
