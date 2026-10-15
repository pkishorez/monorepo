import { Effect, Layer, Option, Queue, Schema, Stream } from 'effect';
import type { MouseEvent } from 'react';
import { Actor, Command } from '../../core/index.ts';
import type { ActorType, AnyActor, Types } from '../../core/index.ts';
import { View } from '../../react/index.ts';
import type { ViewOf } from '../../react/index.ts';
import { Adapter, KEY } from '../adapter/index.ts';
import {
  Loading,
  Navigation,
  moveOptions,
  routeOf,
} from '../capability/index.ts';
import type { AnyRoute, MoveOptions } from '../capability/index.ts';
import { knownOf, preloadViews } from '../page/index.ts';
import type { AnyPage, Known, Preload } from '../page/index.ts';
import type {
  Children,
  Codec,
  How,
  Metadata,
  Place,
  PlaceData,
  PlaceSchema,
  Read,
  Value,
} from '../route/index.ts';
import { Scrolling, keyOf, restores, scriptFor } from '../scroll/index.ts';
import type { ScrollRestorationOptions } from '../scroll/index.ts';
import { linkOptions } from './context.tsx';
import { Frame } from './frame.tsx';

/** What the router needs of a Routes tree. */
export interface RoutesLike<Route> {
  /** The pages under the root, as written. */
  readonly children: object;
  /** The root page: its Place is the Router's one Child. */
  readonly root: AnyPage;
  readonly route: Codec<Route>;
  /** Every place with data, by dotted name, with its data's Schema. */
  readonly data: ReadonlyArray<readonly [string, Codec<unknown>]>;
  readonly read: (url: string) => Read<Route>;
  readonly path: (route: Route) => string;
  readonly metadata: (of: Route | string, data?: PlaceData) => Metadata;
  readonly places: (of: Route | string) => ReadonlyArray<Place>;
  /** Every place of the tree, as Schemas: what a Loader RPC is made from. */
  readonly every: ReadonlyArray<PlaceSchema>;
  readonly preload: { readonly mode: Preload; readonly delay: number };
}

const HOW: ReadonlyArray<How> = ['load', 'push', 'replace', 'back', 'forward'];
/** How a pending move lands: `arrive` is a push the address already shows; `back` and `forward` go to an entry. */
const LANDS = ['push', 'replace', 'load', 'arrive', 'back', 'forward'] as const;
type Lands = (typeof LANDS)[number];
/** Redirects followed in a row before a move gives up, as not found. */
const HOPS = 8;
/** How long a move waits for its data before it lands without it, in milliseconds. */
const DELAY = 150;

/** A move the Router holds while it loads the data of the places it brings. */
export interface PendingMove<Route> {
  /** Which load this is: an answer for any other is dropped. */
  readonly id: number;
  readonly to: Route;
  readonly how: Lands;
  /** The places being loaded, by dotted name. */
  readonly wanted: ReadonlyArray<string>;
  /** How many Redirects led here. */
  readonly hops: number;
  /** When the move began: it lands without its data `delay` after. */
  readonly since: number;
  /** The key the address already holds for where it goes, from before the page loaded, else `null`: a new entry gets a new one. */
  readonly key: string | null;
  /** What the push or replace said besides where it goes. */
  readonly said?: MoveOptions;
}

/** What a move carries besides where it goes and how. */
interface Along {
  /** How many Redirects led here. */
  readonly hops?: number;
  /** The key the address already holds for where it goes. */
  readonly key?: string | null;
  readonly said?: MoveOptions | undefined;
}

/** One entry of the history: its key, its Route, and the element on the page it goes to, if any. */
interface Entry<Route> {
  readonly key: string;
  readonly route: Route;
  readonly hash?: string;
}

/** What a landed move says about its scroll, of what its push or replace said. */
const scrollOf = (said: MoveOptions | undefined) => ({
  ...(said?.resetScroll === undefined ? {} : { resetScroll: said.resetScroll }),
  ...(said?.hashScrollIntoView === undefined
    ? {}
    : { hashScrollIntoView: said.hashScrollIntoView }),
});

/** What a Pushed or Replaced Message said besides where it goes. */
const saidOf = ({
  resetScroll,
  hash,
  hashScrollIntoView,
}: MoveOptions): MoveOptions => ({
  ...(resetScroll === undefined ? {} : { resetScroll }),
  ...(hash ? { hash } : {}),
  ...(hashScrollIntoView === undefined ? {} : { hashScrollIntoView }),
});

/** An entry at `route`, with `hash` if there is one. */
const entryOf = <Route,>(key: string, route: Route, hash?: string) =>
  hash ? { key, route, hash } : { key, route };

/** The router's Model: the history as entries and where it is in them, the last move, and the one it holds. */
export interface RouterModel<Route> {
  readonly entries: ReadonlyArray<Entry<Route>>;
  readonly at: number;
  /** What every key this page load gives starts with, so no key is given twice across reloads: `m` in memory. */
  readonly session: string;
  /** The number the next entry's key ends with. */
  readonly next: number;
  readonly move: {
    readonly from: Route | null;
    readonly to: Route;
    readonly how: How;
    /** `false`: the push or replace said to leave every scroll as it is. */
    readonly resetScroll?: boolean;
    /** How the push or replace said its hash's element is scrolled into view. */
    readonly hashScrollIntoView?: MoveOptions['hashScrollIntoView'];
  };
  readonly pending: PendingMove<Route> | null;
  /**
   * The Route still drawn while a held Back or Forward loads: the history,
   * like the address, is already at the entry it goes to.
   */
  readonly holding: Route | null;
  /** The id the next pending move gets. */
  readonly loads: number;
  /** What the places the last move brought start from, by dotted name. */
  readonly known: Readonly<Record<string, Known>>;
  /** How many times the app was reloaded: each Place loads its data again when it goes up. */
  readonly reload: number;
  /** Whether an Adapter holds the address. */
  readonly attached: boolean;
  /** Whether the Adapter has said which URL the app opened at. */
  readonly loaded: boolean;
}

export type RouterMessage<Route> =
  | ({ readonly _tag: 'Pushed'; readonly route: Route } & MoveOptions)
  | ({ readonly _tag: 'Replaced'; readonly route: Route } & MoveOptions)
  | { readonly _tag: 'Went'; readonly by: number }
  | { readonly _tag: 'WentBackTo'; readonly route: Route }
  | {
      readonly _tag: 'Arrived';
      readonly route: Route;
      readonly key: string | null;
      readonly url: string;
      /** The element on the page the address names, after its `#`. */
      readonly hash: string;
    }
  | { readonly _tag: 'Attached'; readonly session: string }
  | { readonly _tag: 'Left'; readonly url: string }
  | { readonly _tag: 'Waited'; readonly id: number }
  | {
      readonly _tag: 'Loaded';
      readonly id: number;
      readonly known: Readonly<Record<string, Known>>;
    }
  | { readonly _tag: 'Redirected'; readonly id: number; readonly route: Route }
  | { readonly _tag: 'Reloaded' }
  | { readonly _tag: 'Preloading'; readonly route: Route };

/** The router's Input: the Route it starts at and what its places already start from. */
export interface RouterInput<Route> {
  readonly route: Route;
  readonly known?: Readonly<Record<string, Known>>;
}

type Single = { readonly _tag: 'Single' };

/** Through the Adapter, if the Layer has one: in memory, nothing. */
const adapter = (use: (adapter: typeof Adapter.Service) => void) =>
  Effect.serviceOption(Adapter).pipe(
    Effect.map(Option.map(use)),
    Effect.asVoid,
  );

const write = Command.make('write the address', {
  args: Schema.Struct({
    url: Schema.String,
    key: Schema.String,
    replace: Schema.Boolean,
  }),
  run: ({ url, key, replace }) =>
    adapter((at) => (replace ? at.replace(url, key) : at.push(url, key))),
});
const go = Command.make('go', {
  args: Schema.Struct({ by: Schema.Number }),
  run: ({ by }) => adapter((at) => at.go(by)),
});
const leave = Command.make('leave', {
  args: Schema.Struct({ url: Schema.String }),
  run: ({ url }) => adapter((at) => at.leave(url)),
});
const forget = Command.make('forget the Data cache', {
  run: () =>
    Effect.serviceOption(Loading).pipe(
      Effect.flatMap((found) =>
        Option.isSome(found) && found.value.forget
          ? found.value.forget
          : Effect.void,
      ),
    ),
});

/** The link a plain click landed on, unless the click asks for something else: a new tab, a download, a full load. */
const linkOf = (event: MouseEvent): HTMLAnchorElement | undefined => {
  if (event.defaultPrevented || event.button !== 0) return undefined;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return undefined;
  const link = (event.target as Element | null)?.closest?.('a');
  if (!(link instanceof HTMLAnchorElement) || !link.href) return undefined;
  if (link.hasAttribute('download')) return undefined;
  if (link.target && link.target !== '_self') return undefined;
  if (link.relList.contains('external')) return undefined;
  return link;
};

type Cmd = Command<unknown, any>;
type Out = {
  readonly model?: unknown;
  readonly command?: Cmd | ReadonlyArray<Cmd>;
};

/**
 * The router of an app: one Actor, above the app's root page. It holds the
 * history, as entries and where it is in them, and hands the root's Place
 * the current Route. Every move is one Message to it: a link click, a
 * Request on Navigation, the Adapter's Back and Forward. A move to places
 * whose data is not there yet waits up to 150 ms while a Worker loads it
 * through `Loading`, so a quick answer, or a copy the Data cache kept,
 * shows no loading screen; after that the move lands and each new Place
 * loads its own. The data itself lives in the Places, never here. It draws
 * the app, catches plain clicks on links inside it, preloads for links, and
 * writes the Metadata. With no Adapter in the Layer it routes in memory;
 * with one, it writes each move to the address with a Command, and hears
 * the address with a Worker.
 */
export const app = <Route extends AnyRoute, A extends AnyActor>(
  routes: RoutesLike<Route> & { readonly root: { readonly place: A } },
  view: ViewOf<A>,
  options?: {
    /** Where the app is mounted, like `/app`: every link and URL is under it. */
    readonly base?: string;
    /** How long a move waits for its data, in milliseconds, before it lands and its pages show they are loading: 150 unless said. */
    readonly delay?: number;
  } & ScrollRestorationOptions<Route>,
) => {
  const scrolling = (options ?? {}) as ScrollRestorationOptions<never>;
  const delay = options?.delay ?? DELAY;
  const base = (options?.base ?? '').replace(/\/$/, '');
  const href = (route: Route) => {
    const path = routes.path(route);
    return base && path === '/' ? base : `${base}${path}`;
  };
  /** A URL inside the base, without it; `undefined` for a URL outside. */
  const inside = (url: string): string | undefined => {
    if (!base) return url;
    if (url === base) return '/';
    if (url.startsWith(`${base}/`)) return url.slice(base.length);
    if (url.startsWith(`${base}?`)) return `/${url.slice(base.length)}`;
    return undefined;
  };
  const same = (a: Route, b: Route) => routes.path(a) === routes.path(b);
  const start = () => routes.read('/').route;
  const notFound = (route: Route) =>
    ({ _tag: 'NotFound', path: routes.path(route) }) as unknown as Route;

  const RouteSchema = routes.route;
  /** What each place with data may start from, by dotted name, each with its own Schema. */
  const KnownSchema = Schema.Struct(
    Object.fromEntries(
      routes.data.map(([name, data]) => [
        name,
        Schema.optionalKey(
          Schema.Union([
            Schema.TaggedStruct('Ready', { data, stale: Schema.Boolean }),
            Schema.TaggedStruct('Failed', {
              reason: Schema.String,
              notFound: Schema.Boolean,
            }),
          ]),
        ),
      ]),
    ),
  ) as unknown as Codec<Readonly<Record<string, Known>>>;
  const actor = Actor.make('Router', {
    input: Schema.UndefinedOr(
      Schema.Struct({
        route: RouteSchema,
        known: Schema.optionalKey(KnownSchema),
      }),
    ),
    model: Schema.Struct({
      entries: Schema.Array(
        Schema.Struct({
          key: Schema.String,
          route: RouteSchema,
          hash: Schema.optionalKey(Schema.String),
        }),
      ),
      at: Schema.Number,
      session: Schema.String,
      next: Schema.Number,
      move: Schema.Struct({
        from: Schema.NullOr(RouteSchema),
        to: RouteSchema,
        how: Schema.Literals(HOW),
        resetScroll: moveOptions.resetScroll,
        hashScrollIntoView: moveOptions.hashScrollIntoView,
      }),
      pending: Schema.NullOr(
        Schema.Struct({
          id: Schema.Number,
          to: RouteSchema,
          how: Schema.Literals(LANDS),
          wanted: Schema.Array(Schema.String),
          hops: Schema.Number,
          since: Schema.Number,
          key: Schema.NullOr(Schema.String),
          said: Schema.optionalKey(Schema.Struct(moveOptions)),
        }),
      ),
      holding: Schema.NullOr(RouteSchema),
      loads: Schema.Number,
      known: KnownSchema,
      reload: Schema.Number,
      attached: Schema.Boolean,
      loaded: Schema.Boolean,
    }),
    message: Schema.TaggedUnion({
      Pushed: { route: RouteSchema, ...moveOptions },
      Replaced: { route: RouteSchema, ...moveOptions },
      Went: { by: Schema.Number },
      WentBackTo: { route: RouteSchema },
      Arrived: {
        route: RouteSchema,
        key: Schema.NullOr(Schema.String),
        url: Schema.String,
        hash: Schema.String,
      },
      Attached: { session: Schema.String },
      Left: { url: Schema.String },
      Waited: { id: Schema.Number },
      Loaded: { id: Schema.Number, known: KnownSchema },
      Redirected: { id: Schema.Number, route: RouteSchema },
      Reloaded: {},
      Preloading: { route: RouteSchema },
    }),
  } as never) as unknown as {
    build: (behavior: unknown) => AnyActor;
  };

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

  /**
   * A move landing, with what its new places start from. A Redirect or not
   * found on the entry shown keeps the move that led to it, now to where it
   * ends.
   */
  const land = (
    model: Model,
    to: Route,
    how: Lands,
    known: Model['known'],
    { key = null, said }: Along = {},
  ): Out => {
    const settled: Model = { ...model, pending: null, holding: null, known };
    const from = shown(model);
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
    if (
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
    const drawn = new Set(
      routes.places(shown(model)).map((place) => place.key),
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
      known: from?.known ?? {},
      reload: 0,
      attached: false,
      loaded: false,
    };
  };

  type Send = (message: RouterMessage<Route>) => Effect.Effect<void>;
  /**
   * Loads what the pending move wants, through `Loading`: with none, it
   * lands without. The code of the lazy Views it will draw starts loading
   * at the same time, so it is not a second wait after the data. A Redirect,
   * the outermost first, moves on instead.
   */
  const load = (pending: PendingMove<Route>, send: Send) =>
    Effect.gen(function* () {
      preloadViews(routes.children as Children, pending.to as Value);
      const found = yield* Effect.serviceOption(Loading);
      const { id } = pending;
      if (Option.isNone(found))
        return yield* send({ _tag: 'Loaded', id, known: {} });
      const places = routes
        .places(pending.to)
        .filter((place) => pending.wanted.includes(place.name));
      const answers = yield* found.value.load(
        places.map(({ name, params }) => ({ name, params })),
      );
      for (const { name } of places) {
        const answer = answers[name];
        if (answer?._tag === 'Redirect')
          return yield* send({
            _tag: 'Redirected',
            id,
            route: answer.route as Route,
          });
      }
      const known: Record<string, Known> = {};
      for (const { name } of places) {
        const each = answers[name] && knownOf(answers[name]);
        if (each) known[name] = each;
      }
      yield* send({ _tag: 'Loaded', id, known });
    });

  /** Warms the Data cache, and the code of the lazy Views, for a Route the app may move to. */
  const preload = Command.make('preload', {
    args: Schema.Struct({ route: RouteSchema }),
    run: ({ route }) =>
      Effect.gen(function* () {
        preloadViews(routes.children as Children, route as Value);
        const found = yield* Effect.serviceOption(Loading);
        if (Option.isNone(found) || !found.value.preload) return;
        yield* found.value.preload(
          routes
            .places(route as Route)
            .filter((place) => place.input)
            .map(({ name, params }) => ({ name, params })),
        );
      }),
  });

  const reloading = (model: Model): Out => ({
    model: { ...model, reload: model.reload + 1 },
    command: forget(),
  });

  const built = actor.build({
    init: (from: RouterInput<Route> | undefined) => ({
      model: firstModel(from),
    }),
    children: {
      page: {
        actor: routes.root.place,
        input: ({ model }: { readonly model: Model }) => ({
          reload: model.reload,
          for: '{}',
        }),
        props: ({ model }: { readonly model: Model }) => {
          const route = shown(model) as unknown as Value;
          const found = route._tag !== 'NotFound';
          return {
            name: '',
            value: found ? { _tag: '', page: route } : { _tag: '' },
            params: {},
            notFound: found ? null : String(route['path']),
            known: model.known,
            reload: model.reload,
          };
        },
      },
    },
    provides: (self: { readonly send: Send }) =>
      Layer.succeed(Navigation, {
        push: (to, options) =>
          self.send({
            _tag: 'Pushed',
            route: routeOf(to) as Route,
            ...options,
          }),
        replace: (to, options) =>
          self.send({
            _tag: 'Replaced',
            route: routeOf(to) as Route,
            ...options,
          }),
        back: self.send({ _tag: 'Went', by: -1 }),
        forward: self.send({ _tag: 'Went', by: 1 }),
        backTo: (to) =>
          self.send({ _tag: 'WentBackTo', route: routeOf(to) as Route }),
        reload: self.send({ _tag: 'Reloaded' }),
        preload: (to) =>
          self.send({ _tag: 'Preloading', route: routeOf(to) as Route }),
      }),
    on: {
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
          return reloading({ ...model, pending: null });
        return toward(model, route, 'push', at, { said });
      },
      Replaced: (
        message: { readonly route: Route } & MoveOptions,
        { model, at }: { readonly model: Model; readonly at: number },
      ) =>
        toward(model, message.route, 'replace', at, { said: saidOf(message) }),
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
        // with a stray slash, is replaced by the one that is.
        const canonical = routes.path(route) === url;
        const known =
          key === null
            ? -1
            : model.entries.findIndex((entry) => entry.key === key);
        if (known >= 0) {
          if (known === model.at && same(route, current(model).route))
            return canonical ? {} : { command: writing(model, true) };
          const moving = reaching(model, known, route, now);
          return canonical
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
            return { model: opened, command: writing(opened, true) };
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
      // waits on, and each new Place shows it is loading, then loads it.
      Waited: (
        { id }: { readonly id: number },
        { model }: { readonly model: Model },
      ): Out => {
        const pending = model.pending;
        if (pending?.id !== id) return {};
        return land(model, pending.to, pending.how, {}, pending);
      },
      Loaded: (
        { id, known }: { readonly id: number; readonly known: Model['known'] },
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
          pending.how === 'back' || pending.how === 'forward'
            ? 'replace'
            : pending.how;
        if (pending.hops < HOPS)
          return toward(settled, route, how, at, { hops: pending.hops + 1 });
        return land(settled, notFound(pending.to), how, {});
      },
      Reloaded: (_: unknown, { model }: { readonly model: Model }) =>
        reloading(model),
      Preloading: (
        { route }: { readonly route: Route },
        { model }: { readonly model: Model },
      ) => (same(route, shown(model)) ? {} : { command: preload({ route }) }),
    },
    workers: {
      // Loads the data the pending move wants; a newer move stops it.
      load: {
        each: ({ model }: { readonly model: Model }) =>
          model.pending ? [String(model.pending.id)] : [],
        run: (self: {
          readonly send: Send;
          readonly get: Effect.Effect<{ readonly model: Model }>;
        }) =>
          Effect.gen(function* () {
            const { pending } = (yield* self.get).model;
            if (pending) yield* load(pending, self.send);
          }),
      },
      // Lands a move still loading after the delay.
      wait: {
        each: ({ model }: { readonly model: Model }) =>
          model.pending ? [String(model.pending.id)] : [],
        run: (self: {
          readonly send: Send;
          readonly get: Effect.Effect<{ readonly model: Model }>;
          readonly now: Effect.Effect<number>;
        }) =>
          Effect.gen(function* () {
            const { pending } = (yield* self.get).model;
            if (!pending) return;
            const now = yield* self.now;
            yield* Effect.sleep(Math.max(0, pending.since + delay - now));
            yield* self.send({ _tag: 'Waited', id: pending.id });
          }),
      },
      // Keeps what the pages drawn first were handed, as a server's page
      // hands them, in the Data cache: Back to them is at once, as to a
      // page loaded in the browser.
      keep: {
        run: (self: {
          readonly get: Effect.Effect<{ readonly model: Model }>;
        }) =>
          Effect.gen(function* () {
            const found = yield* Effect.serviceOption(Loading);
            if (Option.isNone(found) || !found.value.keep) return;
            const { model } = yield* self.get;
            if (model.move.how !== 'load') return;
            for (const { name, params, input } of routes.places(shown(model))) {
              const known = model.known[name];
              if (input && known?._tag === 'Ready')
                yield* found.value.keep({ name, params }, known.data);
            }
          }),
      },
      // Hears the address, if an Adapter holds one: Back, Forward, a typed URL.
      address: {
        run: (self: {
          readonly send: Send;
          readonly get: Effect.Effect<{ readonly model: Model }>;
        }) =>
          Effect.gen(function* () {
            const found = yield* Effect.serviceOption(Adapter);
            if (Option.isNone(found)) return;
            const at = found.value;
            if (!(yield* self.get).model.attached)
              yield* self.send({
                _tag: 'Attached',
                session: Math.random().toString(36).slice(2, 10),
              });
            const changes = Stream.callback<null>((queue) =>
              Effect.acquireRelease(
                Effect.sync(() => {
                  Queue.offerUnsafe(queue, null);
                  return at.listen(() => void Queue.offerUnsafe(queue, null));
                }),
                (stop) => Effect.sync(stop),
              ),
            );
            yield* Stream.runForEach(changes, () =>
              Effect.gen(function* () {
                const url = inside(at.url());
                if (url === undefined) return;
                const { model } = yield* self.get;
                const entry = current(model);
                const target = model.pending?.to;
                // The Router's own write coming back, or the address of a move still loading: nothing moved.
                if (at.key() === entry.key && url === routes.path(entry.route))
                  return;
                if (target && url === routes.path(target)) return;
                yield* self.send({
                  _tag: 'Arrived',
                  route: routes.read(url).route,
                  key: at.key(),
                  url,
                  hash: at.hash?.() ?? '',
                });
              }),
            );
          }),
      },
    },
  });

  const routerView = View.make(built, (self) => {
    const model = self.model as Model;
    const send = self.send as (message: RouterMessage<Route>) => void;
    const onClick = (event: MouseEvent) => {
      const link = linkOf(event);
      if (!link) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin) return;
      const target = `${url.pathname}${url.search}`;
      // A link to a spot on this page is the browser's to scroll to.
      if (url.hash && target === `${location.pathname}${location.search}`)
        return;
      const within = inside(target);
      if (within === undefined) {
        // Outside the app: the Adapter hands it on; in memory, the browser goes.
        if (!model.attached) return;
        event.preventDefault();
        send({ _tag: 'Left', url: target });
        return;
      }
      event.preventDefault();
      send({
        _tag: 'Pushed',
        route: routes.read(within).route,
        ...linkOptions(link, url),
      });
    };
    const drawn = shown(model);
    return (
      <Frame
        known={model.known}
        drawing={{
          href: href as (route: AnyRoute) => string,
          entries: model.entries,
          at: model.at,
          move: model.move,
          pending: model.pending
            ? {
                to: model.pending.to,
                how:
                  model.pending.how === 'arrive' ? 'push' : model.pending.how,
              }
            : null,
          metadata: routes.metadata(drawn, {}),
          go: (by) => send({ _tag: 'Went', by }),
          reload: () => send({ _tag: 'Reloaded' }),
          preload: (route) =>
            send({ _tag: 'Preloading', route: route as Route }),
          linkPreload: routes.preload,
        }}
        metadataOf={(data) => routes.metadata(drawn, data)}
        attached={model.attached}
        root={self.root}
        onClick={onClick}
      >
        <Scrolling
          options={scrolling}
          at={{
            route: drawn,
            path: routes.path(drawn),
            key: current(model).key,
          }}
          hash={current(model).hash}
          move={model.move}
          pending={model.pending !== null}
          attached={model.attached}
          loaded={model.loaded}
        >
          {(() => {
            const RootView = view as ViewOf<AnyActor>;
            return (
              <RootView
                instance={
                  (self.children as { readonly page: { readonly id: string } })
                    .page
                }
              />
            );
          })()}
        </Scrolling>
      </Frame>
    );
  });

  /**
   * The Router's Input at a URL, with what its places already start from:
   * for `toReact`'s `input`, so an app on an Adapter is drawn at the right
   * page from the first frame, and for a server, which draws a URL from what
   * its Loaders gave. With no URL, the browser's, if there is one. Places
   * that start from nothing load once the Runtime starts.
   */
  const startAt = (
    url?: string,
    known?: Readonly<Record<string, Known>>,
  ): RouterInput<Route> | undefined => {
    const at =
      url ??
      (typeof location === 'undefined'
        ? undefined
        : `${location.pathname}${location.search}`);
    if (at === undefined) return undefined;
    const within = inside(at);
    if (within === undefined) return undefined;
    const route = routes.read(within).route;
    return known ? { route, known } : { route };
  };

  type RouterActor = ActorType<
    'Router',
    RouterInput<Route> | undefined,
    void,
    RouterModel<Route>,
    Single,
    RouterMessage<Route>,
    { readonly Single: { readonly page: A } },
    Exclude<Types<A>['open'], Navigation>
  >;

  /** A key the Router never gives: what a custom key gives back when it keeps the entry's own. */
  const ENTRY = '\u0000entry';
  /**
   * The script a server writes in a page at `route`, run before the app
   * hydrates, that puts its scroll back from the tab's session storage, as
   * TanStack Start's does; `null` where scroll restoration is off.
   */
  const restoreScroll = (route: Route): string | null => {
    if (!restores(scrolling, route)) return null;
    const key = keyOf(scrolling, {
      route,
      path: routes.path(route),
      key: ENTRY,
    });
    return scriptFor(KEY, key === ENTRY ? undefined : key);
  };

  return {
    actor: built as unknown as RouterActor,
    view: routerView as unknown as ViewOf<RouterActor>,
    startAt,
    href,
    restoreScroll,
    /** The Routes it serves: what Start reads a URL and serves the Loaders with. */
    routes,
  };
};
