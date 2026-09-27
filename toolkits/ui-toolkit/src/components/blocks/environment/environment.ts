import {
  readDisplay,
  readPlatform,
  readReducedMotion,
  readViewport,
  WATCHED_QUERIES,
} from './detect';

export { ANDROID_EDGE_STRIP_PX, EDGE_STRIP_PX, edgeStrips } from './edges';
export type { EdgeOwner, EdgeStrips } from './edges';

/** Where the app runs. Edge ownership, and so the Gesture Zone, is decided from this alone. */
export type Environment = {
  readonly platform: 'ios' | 'android' | 'desktop';
  /** `installed` covers every display mode an installed web app launches in. */
  readonly display: 'tab' | 'installed';
  /** `wide` from 768px, where kui's sidebar stays on screen instead of sliding in. */
  readonly viewport: 'compact' | 'wide';
  readonly reducedMotion: boolean;
};

/**
 * The Environment assumed while rendering on the server and during
 * hydration: a wide desktop tab, so the first client render matches the
 * server's markup before the real Environment takes over.
 */
export const serverEnvironment: Environment = {
  platform: 'desktop',
  display: 'tab',
  viewport: 'wide',
  reducedMotion: false,
};

/** Reads the Environment once. */
export const readEnvironment = (win: Window): Environment => ({
  platform: readPlatform(win),
  display: readDisplay(win),
  viewport: readViewport(win),
  reducedMotion: readReducedMotion(win),
});

const sameEnvironment = (a: Environment, b: Environment) =>
  a.platform === b.platform &&
  a.display === b.display &&
  a.viewport === b.viewport &&
  a.reducedMotion === b.reducedMotion;

/**
 * The live Environment as an external store: `get` returns the same object
 * until something it depends on changes (installing the app, rotating past
 * the wide breakpoint, toggling reduced motion), so it suits
 * `useSyncExternalStore` directly.
 */
export const createEnvironmentStore = (win: Window) => {
  let current = readEnvironment(win);
  const listeners = new Set<() => void>();
  const refresh = () => {
    const next = readEnvironment(win);
    if (sameEnvironment(current, next)) return;
    current = next;
    for (const listener of listeners) listener();
  };
  const queries =
    typeof win.matchMedia === 'function'
      ? WATCHED_QUERIES.map((query) => win.matchMedia(query))
      : [];

  return {
    get: (): Environment => current,
    subscribe: (listener: () => void): (() => void) => {
      if (listeners.size === 0) {
        for (const query of queries) query.addEventListener('change', refresh);
        // Changes while nobody listened are picked up on the first subscribe.
        refresh();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        for (const query of queries) {
          query.removeEventListener('change', refresh);
        }
      };
    },
  };
};
