import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as SubscriptionRef from 'effect/SubscriptionRef';
import { isBrowser, listen } from '../../browser/dom-events.js';
import { useSubscriptionRef } from '../../browser/subscription-ref.js';
import { lazyService } from '../lazy-service/index.js';

export type DisplayModeValue =
  | 'browser'
  | 'standalone'
  | 'minimal-ui'
  | 'fullscreen'
  | 'window-controls-overlay';

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

/** How the page is shown: in a browser tab or as an installed app. */
export class DisplayMode extends Context.Service<
  DisplayMode,
  { readonly mode: SubscriptionRef.SubscriptionRef<DisplayModeValue> }
>()('@kstackz/web-toolkit/pwa/DisplayMode') {
  static readonly layer: Layer.Layer<DisplayMode> = Layer.effect(
    this,
    Effect.gen(function* () {
      const mode = yield* SubscriptionRef.make(readDisplayMode());
      if (isBrowser() && typeof window.matchMedia === 'function') {
        const refresh = () =>
          Effect.runSync(SubscriptionRef.set(mode, readDisplayMode()));
        for (const value of INSTALLED_MODES) {
          yield* listen(query(value), 'change', refresh);
        }
      }
      return { mode };
    }),
  );
}

const useDisplayModeService = lazyService(DisplayMode, DisplayMode.layer);

/** The display mode; `'browser'` during SSR and until known. */
export const useDisplayMode = (): DisplayModeValue =>
  useSubscriptionRef(useDisplayModeService()?.mode, 'browser');
