import type { RuntimeState } from '../core/index.ts';

/*
 * Where an app's Log outlives its module: a registry on `globalThis`, keyed
 * by the root Actor's name. While an app is mounted its Log is read live from
 * here; when its last mount closes, the Log is left here. The next mount of an
 * app with that name carries on from it, whether it is the same `toReact`
 * mounted again or a fresh one from a module hot reload, whose new code
 * Replays the old Log. Nothing is ever written on a server, where no mount
 * happens.
 */

interface Kept {
  /** The Log the last closed mount left. */
  readonly saved?: RuntimeState;
  /** The app mounted now, and its Log as it is. */
  readonly live?: {
    readonly app: object;
    readonly state: () => RuntimeState | undefined;
  };
}

const KEY = Symbol.for('effect-oak/apps');

const apps = (): Map<string, Kept> => {
  const global = globalThis as { [KEY]?: Map<string, Kept> };
  return (global[KEY] ??= new Map());
};

export const registry = {
  /** The Log of the app mounted under this name, else the one its last mount left. */
  saved: (name: string): RuntimeState | undefined => {
    const kept = apps().get(name);
    return kept?.live?.state() ?? kept?.saved;
  },
  /** Note that `app` is mounted; false if another app of that name already is. */
  claim: (
    name: string,
    app: object,
    state: () => RuntimeState | undefined,
  ): boolean => {
    const kept = apps().get(name) ?? {};
    const free = kept.live === undefined || kept.live.app === app;
    if (free) apps().set(name, { ...kept, live: { app, state } });
    return free;
  },
  /** Leave the Log as the app closes. */
  release: (name: string, app: object, saved: RuntimeState | undefined) => {
    const kept = apps().get(name);
    if (kept?.live?.app !== app) return;
    const left = saved ?? kept.saved;
    apps().set(name, left ? { saved: left } : {});
  },
  /** Forget every app: for tests. */
  clear: () => apps().clear(),
};
