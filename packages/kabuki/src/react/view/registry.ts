import type { AnyActor } from '../../core/actor/index.ts';
import type { History } from '../../core/history/index.ts';

/*
 * Where an app's History outlives its module: a registry on `globalThis`,
 * keyed by the app's name. While an app is mounted its Runtime's History is
 * read here; when its last mount closes, the History stays, with the Actor
 * that played it. The next mount of an app with that name carries on from
 * it, whether it is the same `View.app` mounted again or a fresh one from a
 * module hot reload, whose new code replays the old History. Nothing is ever
 * written on a server, where no mount happens.
 */

/** A History, with the Actor whose code played it: what a new Actor reads it through. */
export interface Left {
  readonly actor: AnyActor;
  readonly history: History;
}

interface Kept {
  readonly actor: AnyActor;
  readonly history: () => History;
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
  left: (name: string): Left | undefined => {
    const kept = apps().get(name);
    return kept && { actor: kept.actor, history: kept.history() };
  },
  /** The History alone: for tests. */
  history: (name: string): History | undefined => apps().get(name)?.history(),
  /** Note that `app` is mounted, its History read through `history`; false if another app of that name already is. */
  claim: (
    name: string,
    app: object,
    actor: AnyActor,
    history: () => History,
  ): boolean => {
    const live = apps().get(name)?.live;
    if (live !== undefined && live !== app) return false;
    apps().set(name, { actor, history, live: app });
    return true;
  },
  /** Leave the History as it is now, as the app closes. */
  release: (name: string, app: object) => {
    const kept = apps().get(name);
    if (kept?.live !== app) return;
    const history = kept.history();
    apps().set(name, { actor: kept.actor, history: () => history });
  },
  /** Forget every app: for tests. */
  clear: () => apps().clear(),
};
