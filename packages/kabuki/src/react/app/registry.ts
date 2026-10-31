import type { History } from '../../core/history/index.ts';

/*
 * Where an app's History outlives its module: a registry on `globalThis`,
 * keyed by the app's name. While an app is mounted its History is here;
 * when its last mount closes, the History stays. The next mount of an app
 * with that name carries on from it, whether it is the same `toReact`
 * mounted again or a fresh one from a module hot reload, whose new code
 * replays the old History. Nothing is ever written on a server, where no
 * mount happens.
 */

interface Kept {
  readonly history: History;
  /** The app mounted now, if one is. */
  readonly live?: object;
}

const KEY = Symbol.for('@kestack/kabuki/apps');

const apps = (): Map<string, Kept> => {
  const global = globalThis as { [KEY]?: Map<string, Kept> };
  return (global[KEY] ??= new Map());
};

export const registry = {
  /** The History of the app mounted under this name, else the one its last mount left. */
  history: (name: string): History | undefined => apps().get(name)?.history,
  /** Note that `app` is mounted with its History; false if another app of that name already is. */
  claim: (name: string, app: object, history: History): boolean => {
    const live = apps().get(name)?.live;
    if (live !== undefined && live !== app) return false;
    apps().set(name, { history, live: app });
    return true;
  },
  /** Leave the History as the app closes. */
  release: (name: string, app: object) => {
    const kept = apps().get(name);
    if (kept?.live === app) apps().set(name, { history: kept.history });
  },
  /** Forget every app: for tests. */
  clear: () => apps().clear(),
};
