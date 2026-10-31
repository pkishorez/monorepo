import type {
  AnyRoute,
  MoveOptions,
  ReloadOptions,
} from '../capabilities/index.ts';
import type { Known } from '../page/status/index.ts';
import { leave, write } from './commands.ts';
import { renewing, settle } from './data.ts';
import type { PlaceMessage } from './data.ts';
import type { Loads } from './loads.ts';
import { HOPS, entryOf, saidOf } from './model.ts';
import type { Cmd, Out, RouterModel } from './model.ts';
import type { Moves } from './moves.ts';
import type { Urls } from './urls.ts';

/*
 * The Router's Updates: what each Message does to its Model, and the
 * Commands it asks for. A link click, a Request on Navigation and the
 * Adapter's Back and Forward each arrive as one of them.
 */
export const updatesOf = <Route extends AnyRoute>(
  { same, shows, withBase, notFound }: Urls<Route>,
  {
    current,
    shown,
    fresh,
    addressOf,
    writing,
    land,
    toward,
    reaching,
    going,
    reloading,
    reloadingAnew,
  }: Moves<Route>,
  { preload }: Loads<Route>,
) => {
  type Model = RouterModel<Route>;
  const on = {
    Pushed: (
      message: { readonly route: Route } & MoveOptions,
      { model, at }: { readonly model: Model; readonly at: number },
    ): Out => {
      const { route } = message;
      const said = saidOf(message);
      if (model.pending && same(route, model.pending.to)) return {};
      // A link to the page shown loads it again: a failed page retries.
      if (
        same(route, current(model).route) &&
        (said.hash ?? '') === (current(model).hash ?? '')
      )
        return renewing(model.data)
          ? reloadingAnew({ ...model, pending: null }, at, false)
          : reloading({ ...model, pending: null });
      return toward(model, route, 'push', at, { said });
    },
    Replaced: (
      message: { readonly route: Route } & MoveOptions,
      { model, at }: { readonly model: Model; readonly at: number },
    ) => toward(model, message.route, 'replace', at, { said: saidOf(message) }),
    Went: (
      { by }: { readonly by: number },
      { model, at }: { readonly model: Model; readonly at: number },
    ) => going(model, by, at),
    WentBackTo: (
      { route }: { readonly route: Route },
      { model, at }: { readonly model: Model; readonly at: number },
    ) => {
      const before = model.entries[model.at - 1];
      if (before && same(before.route, route)) return going(model, -1, at);
      return toward(model, route, 'replace', at);
    },
    Arrived: (
      {
        route,
        key,
        url,
        hash,
      }: {
        readonly route: Route;
        readonly key: string | null;
        readonly url: string;
        readonly hash: string;
      },
      { model, at: now }: { readonly model: Model; readonly at: number },
    ): Out => {
      // A URL that is not how the Route is written, a redirect's or one
      // with a stray slash, is replaced by the one that is. On the entry
      // the app opened at or holds, one that only has a query no page
      // reads is left as it is.
      const kept = shows(url, route);
      const known =
        key === null
          ? -1
          : model.entries.findIndex((entry) => entry.key === key);
      if (known >= 0) {
        if (known === model.at && same(route, current(model).route))
          return kept ? {} : { command: writing(model, true) };
        const moving = reaching(model, known, route, now);
        return kept
          ? moving
          : {
              ...moving,
              command: [
                ...([] as Array<Cmd>).concat(moving.command ?? []),
                write({
                  url: addressOf(entryOf(key!, route, hash)),
                  key: key!,
                  replace: true,
                }),
              ],
            };
      }
      if (!model.loaded) {
        // The URL the app opened at: this entry, with the key the address
        // kept for it before a reload, else a new one.
        const opened: Model = {
          ...model,
          loaded: true,
          entries: model.entries.map((entry, at) =>
            at === model.at
              ? entryOf(key ?? fresh(model), entry.route, hash)
              : entry,
          ),
          next: key === null ? model.next + 1 : model.next,
        };
        if (same(route, current(opened).route))
          return {
            model: opened,
            command: kept
              ? write({
                  url: `${withBase(url)}${hash ? `#${hash}` : ''}`,
                  key: current(opened).key,
                  replace: true,
                })
              : writing(opened, true),
          };
        return toward(opened, route, 'load', now);
      }
      // A URL the app did not write this page load: typed in, a link from
      // the rest of the site, or an entry from before a reload, whose key
      // it keeps.
      return toward(model, route, 'arrive', now, {
        key,
        ...(hash ? { said: { hash } } : {}),
      });
    },
    Attached: (
      { session }: { readonly session: string },
      { model }: { readonly model: Model },
    ) => ({
      model: { ...model, attached: true, session },
    }),
    Left: ({ url }: { readonly url: string }) => ({
      command: leave({ url }),
    }),
    // Still loading after the delay: the move lands without the data it
    // waits on, and each new place shows it is loading, then loads it.
    Waited: (
      { id }: { readonly id: number },
      { model }: { readonly model: Model },
    ): Out => {
      const pending = model.pending;
      if (pending?.id !== id) return {};
      return land(model, pending.to, pending.how, {}, pending);
    },
    Loaded: (
      {
        id,
        known,
      }: {
        readonly id: number;
        readonly known: Readonly<Record<string, Known>>;
      },
      { model }: { readonly model: Model },
    ): Out => {
      const pending = model.pending;
      if (pending?.id !== id) return {};
      return land(model, pending.to, pending.how, known, pending);
    },
    Redirected: (
      { id, route }: { readonly id: number; readonly route: Route },
      { model, at }: { readonly model: Model; readonly at: number },
    ): Out => {
      const pending = model.pending;
      if (pending?.id !== id) return {};
      const settled = { ...model, pending: null };
      const how =
        pending.how === 'back' ||
        pending.how === 'forward' ||
        pending.how === 'reload'
          ? 'replace'
          : pending.how;
      if (pending.hops < HOPS)
        return toward(settled, route, how, at, { hops: pending.hops + 1 });
      return land(settled, notFound(pending.to), how, {});
    },
    Reloaded: (
      { anew, hold }: ReloadOptions,
      { model, at }: { readonly model: Model; readonly at: number },
    ) => (anew ? reloadingAnew(model, at, hold === true) : reloading(model)),
    Preloading: (
      { route }: { readonly route: Route },
      { model }: { readonly model: Model },
    ): Out =>
      // The page shown, or the move held, is loading it already.
      same(route, shown(model)) ||
      (model.pending !== null && same(route, model.pending.to))
        ? {}
        : { command: preload({ route }) },
    PlaceLoaded: (
      message: Extract<PlaceMessage, { readonly _tag: 'PlaceLoaded' }>,
      { model }: { readonly model: Model },
    ): Out => ({ model: { ...model, data: settle(model.data, message) } }),
    PlaceFailed: (
      message: Extract<PlaceMessage, { readonly _tag: 'PlaceFailed' }>,
      { model }: { readonly model: Model },
    ): Out => ({ model: { ...model, data: settle(model.data, message) } }),
    // A Loader's Redirect for a page on screen replaces the entry.
    PlaceRedirected: (
      { route }: { readonly route: AnyRoute },
      { model, at }: { readonly model: Model; readonly at: number },
    ) => toward(model, route as Route, 'replace', at),
    // A Loader's Redirect out of the app: the move it ends, if any, is
    // dropped, and the URL takes the entry's place. In memory, nothing is
    // left.
    RedirectedAway: (
      { href, id }: { readonly href: string; readonly id?: number },
      { model }: { readonly model: Model },
    ): Out => ({
      model:
        id !== undefined && model.pending?.id === id
          ? { ...model, pending: null }
          : model,
      command: leave({ url: href, replace: true }),
    }),
  };
  return on;
};
