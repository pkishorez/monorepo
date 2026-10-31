import type { AnyRoute } from '../capabilities/index.ts';
import { holdingAt, anewOf } from './data.ts';
import type { Known } from '../page/status/index.ts';
import { forget, go, write } from './commands.ts';
import { entryOf, scrollOf } from './model.ts';
import type {
  Along,
  Cmd,
  Entry,
  Lands,
  Out,
  PendingMove,
  RouterInput,
  RouterModel,
  RoutesLike,
} from './model.ts';
import type { Urls } from './urls.ts';

/*
 * How the Router's Model moves, purely: a move lands at once when the data
 * of every place it brings is on screen, else it waits, pending, while the
 * places load; Back and Forward move the history at once; a reload loads
 * the places on screen again.
 */
export const movesOf = <Route extends AnyRoute>(
  routes: RoutesLike<Route>,
  { href, same, start }: Urls<Route>,
) => {
  type Model = RouterModel<Route>;
  const current = (model: Model) => model.entries[model.at]!;
  /** The Route drawn: the current entry's, or the one a held Back or Forward still draws. */
  const shown = (model: Model) => model.holding ?? current(model).route;
  /** A key no entry has had, in this page load or any before it. */
  const fresh = (model: Model) => `${model.session}.${model.next}`;
  /** Where an entry is in the address: its Route's URL, and its hash. */
  const addressOf = (entry: Entry<Route>) =>
    `${href(entry.route)}${entry.hash ? `#${entry.hash}` : ''}`;
  const writing = (model: Model, replace: boolean) =>
    write({
      url: addressOf(current(model)),
      key: current(model).key,
      replace,
    });

  /** The model with the data of the places on the Route it draws: each new place starts from what is known. */
  const withData = (model: Model, known: Readonly<Record<string, Known>>) => ({
    ...model,
    data: holdingAt(routes, shown(model), model.data, known, model.reload),
  });

  /**
   * A move landing, with what its new places start from. A Redirect or not
   * found on the entry shown keeps the move that led to it, now to where it
   * ends.
   */
  const land = (
    model: Model,
    to: Route,
    how: Lands,
    known: Readonly<Record<string, Known>>,
    along: Along = {},
  ): Out => {
    const out = landing(model, to, how, along);
    return { ...out, model: withData(out.model as Model, known) };
  };

  const landing = (
    model: Model,
    to: Route,
    how: Lands,
    { key = null, said }: Along = {},
  ): Out & { readonly model: Model } => {
    const settled: Model = { ...model, pending: null, holding: null };
    const from = shown(model);
    // A reload anew stays where it is: only its data is new.
    if (how === 'reload') return { model: settled };
    // Back and Forward are at their entry already: the move only lands.
    if (how === 'back' || how === 'forward')
      return { model: { ...settled, move: { from, to, how } } };
    if (how === 'load') {
      const changed = !same(to, from);
      const next: Model = {
        ...settled,
        entries: settled.entries.map((entry, at) =>
          at === model.at ? entryOf(entry.key, to, entry.hash) : entry,
        ),
        move: changed ? { ...model.move, to } : model.move,
      };
      return changed
        ? { model: next, command: writing(next, true) }
        : { model: next };
    }
    if (how === 'replace') {
      // A new entry in the place of the one shown, with a key of its own:
      // what was kept for the one before is not its.
      const next: Model = {
        ...settled,
        entries: settled.entries.map((entry, at) =>
          at === model.at ? entryOf(fresh(model), to, said?.hash) : entry,
        ),
        next: model.next + 1,
        move: { from, to, how: 'replace', ...scrollOf(said) },
      };
      return { model: next, command: writing(next, true) };
    }
    // A URL the app did not write is an entry the address already holds,
    // even at the Route shown: a redirect's is written over.
    if (
      how !== 'arrive' &&
      same(to, current(model).route) &&
      (said?.hash ?? '') === (current(model).hash ?? '')
    )
      return { model: settled };
    const next: Model = {
      ...settled,
      entries: [
        ...model.entries.slice(0, model.at + 1),
        entryOf(key ?? fresh(model), to, said?.hash),
      ],
      at: model.at + 1,
      next: key === null ? model.next + 1 : model.next,
      move: { from, to, how: 'push', ...scrollOf(said) },
    };
    return { model: next, command: writing(next, how === 'arrive') };
  };

  /**
   * A move to `route`: it lands at once if every place it brings with data
   * is already on screen; otherwise it waits, pending, while the `load`
   * Worker loads the rest, at most `delay`.
   */
  const toward = (
    model: Model,
    route: Route,
    how: Lands,
    now: number,
    along: Along = {},
  ): Out => {
    // Data being loaded anew is drawn only until the move lands.
    const drawn = new Set(
      routes
        .places(shown(model))
        .filter((place) => !model.data[place.name]?.anew)
        .map((place) => place.key),
    );
    const wanted = routes
      .places(route)
      .filter((place) => place.input && !drawn.has(place.key))
      .map((place) => place.name);
    if (wanted.length === 0) return land(model, route, how, {}, along);
    const pending: PendingMove<Route> = {
      id: model.loads,
      to: route,
      how,
      wanted,
      hops: along.hops ?? 0,
      since: now,
      key: along.key ?? null,
      ...(along.said ? { said: along.said } : {}),
    };
    return { model: { ...model, pending, loads: model.loads + 1 } };
  };

  /**
   * To entry `to` of the history, at `route`: the history moves at once, as
   * the address does, and the Route shown stays drawn while the move is
   * held, so anything that replaces the move starts from where the address is.
   */
  const reaching = (model: Model, to: number, route: Route, now: number) =>
    toward(
      {
        ...model,
        at: to,
        entries: model.entries.map((entry, at) =>
          at === to ? { key: entry.key, route } : entry,
        ),
        holding: shown(model),
      },
      route,
      to < model.at ? 'back' : 'forward',
      now,
    );

  /** Back or Forward by `by` entries, the address too. */
  const going = (model: Model, by: number, now: number): Out => {
    const to = Math.min(Math.max(model.at + by, 0), model.entries.length - 1);
    if (to === model.at) return {};
    const moving = reaching(model, to, model.entries[to]!.route, now);
    return {
      ...moving,
      command: [
        ...([] as Array<Cmd>).concat(moving.command ?? []),
        go({ by: to - model.at }),
      ],
    };
  };

  const firstModel = (from: RouterInput<Route> | undefined): Model => {
    const route = from?.route ?? start();
    return {
      entries: [{ key: 'm.0', route }],
      at: 0,
      session: 'm',
      next: 1,
      move: { from: null, to: route, how: 'load' },
      pending: null,
      holding: null,
      loads: 0,
      data: holdingAt(routes, route, {}, from?.known ?? {}, 0),
      reload: 0,
      attached: false,
      loaded: false,
    };
  };

  const reloading = (model: Model): Out => ({
    model: { ...model, reload: model.reload + 1 },
    command: forget(),
  });

  /**
   * A reload anew: the data of every place on screen is no one's any more.
   * It is shown while a move is held, as a move to another page would be,
   * and never kept: the move held, if there is one, now loads it too, else
   * the Router holds one to the Route shown. Held (`hold`), or joining a
   * held one, it waits for its data however long.
   */
  const reloadingAnew = (model: Model, now: number, hold: boolean): Out => {
    const marked: Model = { ...model, data: anewOf(model.data) };
    const out = model.pending
      ? toward(marked, model.pending.to, model.pending.how, now, model.pending)
      : toward(marked, shown(model), 'reload', now);
    const next = out.model as Model | undefined;
    if (next?.pending)
      return {
        ...out,
        model: {
          ...next,
          pending: {
            ...next.pending,
            anew: true,
            ...(hold || model.pending?.hold ? { hold: true } : {}),
          },
        },
      };
    // Nothing on screen has data: what the Data cache keeps goes all the same.
    return {
      ...out,
      command: [...([] as Array<Cmd>).concat(out.command ?? []), forget()],
    };
  };

  return {
    current,
    shown,
    fresh,
    addressOf,
    writing,
    land,
    toward,
    reaching,
    going,
    firstModel,
    reloading,
    reloadingAnew,
  };
};

export type Moves<Route extends AnyRoute> = ReturnType<typeof movesOf<Route>>;
