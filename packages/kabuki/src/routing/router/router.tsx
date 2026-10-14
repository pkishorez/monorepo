import { Cause, Effect, Layer, Option, Queue, Schema, Stream } from 'effect';
import type { MouseEvent, ReactNode } from 'react';
import { Actor, Command } from '../../core/index.ts';
import type { ActorType, AnyActor, Types } from '../../core/index.ts';
import { View } from '../../react/index.ts';
import type { ViewOf } from '../../react/index.ts';
import { Adapter } from '../adapter/index.ts';
import type {
  Children,
  Codec,
  Failure,
  How,
  Inputs,
  LoadError,
  Metadata,
  Place,
  PlaceSchema,
  Read,
  Value,
} from '../route/index.ts';
import { MetadataWriter, RouterContext } from './context.tsx';
import type { Drawing, Entry } from './context.tsx';
import { Loading } from './loading.ts';
import { Navigation } from './navigation.ts';
import type { AnyRoute } from './navigation.ts';
import { hasPendingScreen, preloadViews } from './outlet.tsx';
import { keep, wanted } from './plan.ts';

/** What the router needs of a Routes tree. */
export interface RoutesLike<Route> {
  /** The nodes as written: where the outlets made from them keep their lazy Views. */
  readonly children: object;
  readonly route: Codec<Route>;
  readonly inputs: Codec<Inputs>;
  readonly read: (url: string) => Read<Route>;
  readonly path: (route: Route) => string;
  readonly metadata: (of: Route | string, inputs?: Inputs) => Metadata;
  readonly places: (of: Route | string) => ReadonlyArray<Place>;
  readonly every: ReadonlyArray<PlaceSchema>;
}

const HOW: ReadonlyArray<How> = ['load', 'push', 'replace', 'back', 'forward'];
/** How a pending move lands: `arrive` is a push the address already shows. */
const LANDS = ['push', 'replace', 'load', 'arrive'] as const;
type Lands = (typeof LANDS)[number];
/** Redirects followed in a row before a move gives up, as not found. */
const HOPS = 8;
/** How long a move waits before its page's pending screen shows, and how long the screen then stays at least, in milliseconds. */
const PENDING = { delay: 150, minimum: 300 };

/** A move the Router waits on while it loads the Inputs its places need. */
export interface PendingMove<Route> {
  /** Which load this is: an answer for any other is dropped. */
  readonly id: number;
  readonly to: Route;
  readonly how: Lands;
  /** The Inputs kept from the entry shown: places whose key did not change. */
  readonly inputs: Inputs;
  /** The places being loaded, by dotted name. */
  readonly wanted: ReadonlyArray<string>;
  /** How many Redirects led here. */
  readonly hops: number;
  /** When the move landed early, to show a pending screen while it loads. */
  readonly shown: number | null;
  /** The Inputs that came, held while the pending screen has not stayed its minimum. */
  readonly ready: Inputs | null;
}

/** The router's Model: the history as entries and where it is in them, the last move, and the one it waits on. */
export interface RouterModel<Route> {
  readonly entries: ReadonlyArray<{
    readonly key: string;
    readonly route: Route;
    readonly inputs: Inputs;
    readonly failed?: Failure;
  }>;
  readonly at: number;
  /** The key the next entry gets. */
  readonly next: number;
  readonly move: {
    readonly from: Route | null;
    readonly to: Route;
    readonly how: How;
  };
  readonly pending: PendingMove<Route> | null;
  /** The id the next pending move gets. */
  readonly loads: number;
  /** Whether an Adapter holds the address. */
  readonly attached: boolean;
  /** Whether the Adapter has said which URL the app opened at. */
  readonly loaded: boolean;
}

/** Why a load did not give the Inputs: a Loader's answer, or something broke on the way. */
export type LoadFailure<Route> =
  | { readonly _tag: 'NotFound' }
  | { readonly _tag: 'Redirect'; readonly route: Route }
  | { readonly _tag: 'Broken'; readonly reason: string };

export type RouterMessage<Route> =
  | { readonly _tag: 'Pushed'; readonly route: Route }
  | { readonly _tag: 'Replaced'; readonly route: Route }
  | { readonly _tag: 'Went'; readonly by: number }
  | { readonly _tag: 'WentBackTo'; readonly route: Route }
  | {
      readonly _tag: 'Arrived';
      readonly route: Route;
      readonly key: string | null;
      readonly url: string;
    }
  | { readonly _tag: 'Attached' }
  | { readonly _tag: 'Left'; readonly url: string }
  | { readonly _tag: 'Waited'; readonly id: number }
  | { readonly _tag: 'Loaded'; readonly id: number; readonly inputs: Inputs }
  | {
      readonly _tag: 'Failed';
      readonly id: number;
      readonly failure: LoadFailure<Route>;
    };

/** The router's Input: the Route it starts at and the Inputs its places already have. */
export interface RouterInput<Route> {
  readonly route: Route;
  readonly inputs?: Inputs;
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

type Cmd = ReturnType<typeof write>;
type Out = {
  readonly model?: unknown;
  readonly command?: Cmd | ReadonlyArray<Cmd>;
};

/**
 * The router of an app: one Actor, above the app's own root. It holds the
 * history, as entries and where it is in them, each with the Inputs of its
 * places, and hands the app the current Route and those Inputs as Props,
 * `{ page, inputs }`. Every move is one Message to it: a link click, a
 * Request on Navigation, the Adapter's Back and Forward. A move to places
 * that need Inputs it does not hold waits, pending, while a Worker loads
 * them through `Loading`; Back and Forward reuse the Inputs an entry holds.
 * It draws the app, catches plain clicks on links inside it, and writes
 * the Metadata. With no Adapter in the Layer it routes in memory; with one,
 * it writes each move to the address with a Command, and hears the address
 * with a Worker.
 */
export const app = <Route extends AnyRoute, A extends AnyActor>(
  routes: RoutesLike<Route>,
  page: { readonly actor: A; readonly view: ViewOf<A> },
  options?: {
    /** Where the app is mounted, like `/app`: every link and URL is under it. */
    readonly base?: string;
    /** The failed screen of every page that has none of its own. */
    readonly failed?: (failure: Failure) => ReactNode;
    /**
     * How long a move waits, in milliseconds, before its page's pending
     * screen shows, so a quick load shows none; and how long the screen
     * then stays at least, so it never flashes. 150 and 300 unless said.
     */
    readonly pending?: { readonly delay?: number; readonly minimum?: number };
  },
) => {
  const delay = options?.pending?.delay ?? PENDING.delay;
  const minimum = options?.pending?.minimum ?? PENDING.minimum;
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
  const InputsSchema = routes.inputs;
  const checkInputs = Schema.is(Schema.toType(InputsSchema));
  const EntrySchema = Schema.Struct({
    key: Schema.String,
    route: RouteSchema,
    inputs: InputsSchema,
    failed: Schema.optionalKey(Schema.Struct({ reason: Schema.String })),
  });
  const actor = Actor.make('Router', {
    input: Schema.UndefinedOr(
      Schema.Struct({
        route: RouteSchema,
        inputs: Schema.optionalKey(InputsSchema),
      }),
    ),
    model: Schema.Struct({
      entries: Schema.Array(EntrySchema),
      at: Schema.Number,
      next: Schema.Number,
      move: Schema.Struct({
        from: Schema.NullOr(RouteSchema),
        to: RouteSchema,
        how: Schema.Literals(HOW),
      }),
      pending: Schema.NullOr(
        Schema.Struct({
          id: Schema.Number,
          to: RouteSchema,
          how: Schema.Literals(LANDS),
          inputs: InputsSchema,
          wanted: Schema.Array(Schema.String),
          hops: Schema.Number,
          shown: Schema.NullOr(Schema.Number),
          ready: Schema.NullOr(InputsSchema),
        }),
      ),
      loads: Schema.Number,
      attached: Schema.Boolean,
      loaded: Schema.Boolean,
    }),
    message: Schema.TaggedUnion({
      Pushed: { route: RouteSchema },
      Replaced: { route: RouteSchema },
      Went: { by: Schema.Number },
      WentBackTo: { route: RouteSchema },
      Arrived: {
        route: RouteSchema,
        key: Schema.NullOr(Schema.String),
        url: Schema.String,
      },
      Attached: {},
      Left: { url: Schema.String },
      Waited: { id: Schema.Number },
      Loaded: { id: Schema.Number, inputs: InputsSchema },
      Failed: {
        id: Schema.Number,
        failure: Schema.TaggedUnion({
          NotFound: {},
          Redirect: { route: RouteSchema },
          Broken: { reason: Schema.String },
        }),
      },
    }),
  } as never) as unknown as {
    build: (behavior: unknown) => AnyActor;
  };

  type Model = RouterModel<Route>;
  const current = (model: Model) => model.entries[model.at]!;
  const moved = (model: Model, to: number, how: How): Model => ({
    ...model,
    at: to,
    pending: null,
    move: { from: current(model).route, to: model.entries[to]!.route, how },
  });
  const replaced = (model: Model, route: Route, inputs: Inputs): Model => ({
    ...model,
    entries: model.entries.map((entry, index) =>
      index === model.at ? { key: entry.key, route, inputs } : entry,
    ),
    pending: null,
    move: { from: current(model).route, to: route, how: 'replace' },
  });
  const pushed = (model: Model, route: Route, inputs: Inputs): Model => ({
    ...model,
    entries: [
      ...model.entries.slice(0, model.at + 1),
      { key: String(model.next), route, inputs },
    ],
    at: model.at + 1,
    next: model.next + 1,
    pending: null,
    move: { from: current(model).route, to: route, how: 'push' },
  });
  /** The entry shown now, at `route` with `inputs`: the first one, or the one the address opened at. */
  const filled = (model: Model, route: Route, inputs: Inputs): Model => ({
    ...model,
    entries: model.entries.map((entry, index) =>
      index === model.at ? { key: entry.key, route, inputs } : entry,
    ),
    pending: null,
    move: same(route, current(model).route)
      ? model.move
      : { from: null, to: route, how: 'load' },
  });
  /** The entry shown, marked as one whose move broke, or no longer. */
  const marked = (model: Model, failed?: Failure): Model => ({
    ...model,
    entries: model.entries.map((entry, index) =>
      index === model.at
        ? {
            key: entry.key,
            route: entry.route,
            inputs: entry.inputs,
            ...(failed ? { failed } : {}),
          }
        : entry,
    ),
  });
  const writing = (model: Model, replace: boolean) =>
    write({
      url: href(current(model).route),
      key: current(model).key,
      replace,
    });

  /** A move landing, with every Input its places need. */
  const land = (model: Model, route: Route, how: Lands, inputs: Inputs) => {
    if (how === 'load') {
      const changed = !same(route, current(model).route);
      const next = filled(model, route, inputs);
      return changed
        ? { model: next, command: writing(next, true) }
        : { model: next };
    }
    if (how === 'replace') {
      const next = replaced(model, route, inputs);
      return { model: next, command: writing(next, true) };
    }
    if (same(route, current(model).route))
      return { model: { ...model, pending: null } };
    const next = pushed(model, route, inputs);
    return { model: next, command: writing(next, how === 'arrive') };
  };

  /**
   * A move to `route`: it lands at once if its places have every Input they
   * need, kept from the entry shown where a place's key did not change;
   * otherwise it waits, pending, while the `load` Worker loads the rest.
   */
  const toward = (model: Model, route: Route, how: Lands, hops = 0) => {
    const places = routes.places(route);
    const shown = current(model);
    const inputs = keep(routes.places(shown.route), shown.inputs, places);
    const missing = wanted(places, inputs);
    if (missing.length === 0) return land(model, route, how, inputs);
    const pending: PendingMove<Route> = {
      id: model.loads,
      to: route,
      how,
      inputs,
      wanted: missing,
      hops,
      shown: null,
      ready: null,
    };
    return { model: { ...model, pending, loads: model.loads + 1 } };
  };

  /**
   * After Back or Forward: the entry reached keeps its Inputs; any it lacks
   * are loaded, again if the move to it broke.
   */
  const reached = (model: Model, command?: Cmd): Out => {
    const filling = toward(marked(model), current(model).route, 'load');
    return {
      model: filling.model,
      ...(command === undefined ? {} : { command }),
    };
  };

  const going = (model: Model, by: number): Out => {
    const to = Math.min(Math.max(model.at + by, 0), model.entries.length - 1);
    if (to === model.at) return {};
    return reached(
      moved(model, to, to < model.at ? 'back' : 'forward'),
      go({ by: to - model.at }),
    );
  };

  const firstModel = (from: RouterInput<Route> | undefined): Model => {
    const route = from?.route ?? start();
    const places = routes.places(route);
    const inputs = keep(places, from?.inputs ?? {}, places);
    const missing = wanted(places, inputs);
    return {
      entries: [{ key: '0', route, inputs }],
      at: 0,
      next: 1,
      move: { from: null, to: route, how: 'load' },
      pending:
        missing.length === 0
          ? null
          : {
              id: 0,
              to: route,
              how: 'load',
              inputs,
              wanted: missing,
              hops: 0,
              shown: null,
              ready: null,
            },
      loads: 1,
      attached: false,
      loaded: false,
    };
  };

  type Send = (message: RouterMessage<Route>) => Effect.Effect<void>;
  /**
   * Loads what the pending move wants, through `Loading`: with none, it
   * lands with what it has. The code of the lazy Views it will draw starts
   * loading at the same time, so it is not a second wait after the Inputs.
   */
  const load = (pending: PendingMove<Route>, send: Send) =>
    Effect.gen(function* () {
      preloadViews(routes.children as Children, pending.to as Value);
      const found = yield* Effect.serviceOption(Loading);
      const id = pending.id;
      if (Option.isNone(found))
        return yield* send({ _tag: 'Loaded', id, inputs: {} });
      const places = routes
        .places(pending.to)
        .filter((place) => pending.wanted.includes(place.name))
        .map(({ name, params }) => ({ name, params }));
      const failed = (failure: LoadFailure<Route>) =>
        send({ _tag: 'Failed', id, failure });
      yield* found.value.load(places).pipe(
        Effect.flatMap((answer) => {
          const inputs = Object.fromEntries(
            pending.wanted.map((name) => [name, answer[name]]),
          );
          const missing = pending.wanted.filter(
            (name) => inputs[name] === undefined,
          );
          if (missing.length > 0)
            return failed({
              _tag: 'Broken',
              reason: `no Input for ${missing.join(', ')}`,
            });
          if (!checkInputs(inputs))
            return failed({
              _tag: 'Broken',
              reason: 'an Input does not match its Schema',
            });
          return send({ _tag: 'Loaded', id, inputs });
        }),
        Effect.catch((error: LoadError) =>
          failed(
            error._tag === 'NotFound'
              ? { _tag: 'NotFound' }
              : { _tag: 'Redirect', route: error.route as Route },
          ),
        ),
        Effect.catchCause((cause) => {
          const error = Cause.squash(cause);
          return failed({
            _tag: 'Broken',
            reason: error instanceof Error ? error.message : String(error),
          });
        }),
      );
    });

  const built = actor.build({
    init: (from: RouterInput<Route> | undefined) => ({
      model: firstModel(from),
    }),
    children: { page: page.actor },
    invoke: ({ model }: { readonly model: Model }) => {
      const { route, inputs } = current(model);
      return {
        page: {
          props: {
            page: route,
            ...(Object.keys(inputs).length > 0 ? { inputs } : {}),
          },
        },
      };
    },
    provides: (self: { readonly send: Send }) =>
      Layer.succeed(Navigation, {
        push: (route) => self.send({ _tag: 'Pushed', route: route as Route }),
        replace: (route) =>
          self.send({ _tag: 'Replaced', route: route as Route }),
        back: self.send({ _tag: 'Went', by: -1 }),
        forward: self.send({ _tag: 'Went', by: 1 }),
        backTo: (route) =>
          self.send({ _tag: 'WentBackTo', route: route as Route }),
      }),
    on: {
      Pushed: (
        { route }: { readonly route: Route },
        { model }: { readonly model: Model },
      ) => {
        if (model.pending && same(route, model.pending.to)) return {};
        if (same(route, current(model).route)) {
          // A link to a page whose move broke tries it again.
          if (current(model).failed) return reached(model);
          return model.pending ? { model: { ...model, pending: null } } : {};
        }
        return toward(model, route, 'push');
      },
      Replaced: (
        { route }: { readonly route: Route },
        { model }: { readonly model: Model },
      ) => toward(model, route, 'replace'),
      Went: (
        { by }: { readonly by: number },
        { model }: { readonly model: Model },
      ) => going(model, by),
      WentBackTo: (
        { route }: { readonly route: Route },
        { model }: { readonly model: Model },
      ) => {
        const before = model.entries[model.at - 1];
        if (before && same(before.route, route)) return going(model, -1);
        return toward(model, route, 'replace');
      },
      Arrived: (
        {
          route,
          key,
          url,
        }: {
          readonly route: Route;
          readonly key: string | null;
          readonly url: string;
        },
        { model }: { readonly model: Model },
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
          const at = moved(
            {
              ...model,
              entries: model.entries.map((entry, index) =>
                index === known && !same(route, entry.route)
                  ? { key: entry.key, route, inputs: {} }
                  : entry,
              ),
            },
            known,
            known < model.at ? 'back' : 'forward',
          );
          return reached(at, canonical ? undefined : writing(at, true));
        }
        if (!model.loaded) {
          // The URL the app opened at: this entry, now with the router's key.
          // A load already under way for it, as for a place drawn without
          // its Input on a server, carries on rather than starting again.
          const loading = model.pending && same(model.pending.to, route);
          const opened: Model = {
            ...model,
            loaded: true,
            pending: loading ? model.pending : null,
          };
          if (same(route, current(opened).route)) {
            if (loading)
              return { model: opened, command: writing(opened, true) };
            const filling = reached(opened);
            return {
              model: filling.model,
              command: writing(opened, true),
            };
          }
          return toward(opened, route, 'load');
        }
        // A URL the app did not write: typed in, or a link from the rest of the site.
        return toward(model, route, 'arrive');
      },
      Attached: (_: unknown, { model }: { readonly model: Model }) => ({
        model: { ...model, attached: true },
      }),
      Left: ({ url }: { readonly url: string }) => ({
        command: leave({ url }),
      }),
      // Still loading after the delay: the move lands without the Inputs
      // it waits on, and their slot shows the pending screen.
      Waited: (
        { id }: { readonly id: number },
        { model, at }: { readonly model: Model; readonly at: number },
      ) => {
        const pending = model.pending;
        if (pending?.id !== id || pending.shown !== null) return {};
        const landed = land(model, pending.to, pending.how, pending.inputs);
        return {
          ...landed,
          model: {
            ...landed.model,
            pending: { ...pending, how: 'load', shown: at },
          },
        };
      },
      Loaded: (
        { id, inputs }: { readonly id: number; readonly inputs: Inputs },
        { model, at }: { readonly model: Model; readonly at: number },
      ) => {
        const pending = model.pending;
        if (pending?.id !== id) return {};
        const all = { ...pending.inputs, ...inputs };
        // A pending screen stays its minimum: the `hold` Worker lands it then.
        if (
          pending.shown !== null &&
          pending.ready === null &&
          at - pending.shown < minimum
        )
          return { model: { ...model, pending: { ...pending, ready: all } } };
        return land(model, pending.to, pending.how, all);
      },
      Failed: (
        {
          id,
          failure,
        }: { readonly id: number; readonly failure: LoadFailure<Route> },
        { model }: { readonly model: Model },
      ) => {
        const pending = model.pending;
        if (pending?.id !== id) return {};
        const settled = { ...model, pending: null };
        if (failure._tag === 'Broken') {
          // The move lands without the Inputs it waited on, marked: its
          // slot shows the failed screen, and a link to it tries again.
          const landed = same(pending.to, current(model).route)
            ? { model: settled }
            : land(settled, pending.to, pending.how, pending.inputs);
          return {
            ...landed,
            model: marked(landed.model, { reason: failure.reason }),
          };
        }
        if (failure._tag === 'Redirect' && pending.hops < HOPS)
          return toward(settled, failure.route, pending.how, pending.hops + 1);
        return land(settled, notFound(pending.to), pending.how, {});
      },
    },
    workers: {
      // Loads the Inputs the pending move wants; a newer move stops it.
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
      // Lands a move that is still loading after the delay, if the outermost
      // place it waits on has a pending screen to show in its stead.
      wait: {
        each: ({ model }: { readonly model: Model }) => {
          const pending = model.pending;
          return pending &&
            pending.shown === null &&
            !same(pending.to, current(model).route) &&
            hasPendingScreen(
              routes.children as Children,
              pending.to as Value,
              pending.wanted[0]!,
            )
            ? [String(pending.id)]
            : [];
        },
        run: (self: {
          readonly send: Send;
          readonly get: Effect.Effect<{ readonly model: Model }>;
        }) =>
          Effect.gen(function* () {
            const { pending } = (yield* self.get).model;
            if (!pending) return;
            yield* Effect.sleep(delay);
            yield* self.send({ _tag: 'Waited', id: pending.id });
          }),
      },
      // Lands Inputs that came while a pending screen had not stayed its minimum.
      hold: {
        each: ({ model }: { readonly model: Model }) =>
          model.pending?.ready ? [String(model.pending.id)] : [],
        run: (self: {
          readonly send: Send;
          readonly get: Effect.Effect<{ readonly model: Model }>;
          readonly now: Effect.Effect<number>;
        }) =>
          Effect.gen(function* () {
            const { pending } = (yield* self.get).model;
            if (!pending?.ready || pending.shown === null) return;
            const now = yield* self.now;
            yield* Effect.sleep(Math.max(0, pending.shown + minimum - now));
            yield* self.send({
              _tag: 'Loaded',
              id: pending.id,
              inputs: pending.ready,
            });
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
              yield* self.send({ _tag: 'Attached' });
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
                // The Router's own write coming back, or the address of a move still loading: nothing moved.
                if (at.key() === entry.key && url === routes.path(entry.route))
                  return;
                yield* self.send({
                  _tag: 'Arrived',
                  route: routes.read(url).route,
                  key: at.key(),
                  url,
                });
              }),
            );
          }),
      },
    },
  });

  /** What the View draws. */
  function Frame({
    model,
    send,
    root,
    instance,
  }: {
    readonly model: Model;
    readonly send: (message: RouterMessage<Route>) => void;
    readonly root: object;
    readonly instance: { readonly id: string };
  }) {
    const entry = current(model);
    const metadata = routes.metadata(entry.route, entry.inputs);
    const pending = model.pending;
    const drawing: Drawing = {
      href: href as (route: AnyRoute) => string,
      entries: model.entries as ReadonlyArray<Entry>,
      at: model.at,
      move: model.move,
      pending: pending
        ? {
            to: pending.to,
            how: pending.how === 'arrive' ? 'push' : pending.how,
          }
        : null,
      failed: entry.failed ?? null,
      failedScreen: options?.failed,
      metadata,
      go: (by) => send({ _tag: 'Went', by }),
    };
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
      send({ _tag: 'Pushed', route: routes.read(within).route });
    };
    const PageView = page.view as ViewOf<AnyActor>;
    return (
      <RouterContext value={drawing}>
        {model.attached && <MetadataWriter metadata={metadata} />}
        <div {...root} style={{ display: 'contents' }} onClick={onClick}>
          <PageView instance={instance} />
        </div>
      </RouterContext>
    );
  }

  const view = View.make(built, (self) => (
    <Frame
      model={self.model as Model}
      send={self.send as (message: RouterMessage<Route>) => void}
      root={self.root}
      instance={
        (self.children as { readonly page: { readonly id: string } }).page
      }
    />
  ));

  /**
   * The Router's Input at a URL, with the Inputs its places already have:
   * for `toReact`'s `input`, so an app on an Adapter is drawn at the right
   * page from the first frame, and for a server, which draws a URL from the
   * Inputs its Loaders gave. With no URL, the browser's, if there is one; a
   * redirect's URL starts at the Route it names. Places it has no Input for
   * are loaded once the Runtime starts.
   */
  const startAt = (
    url?: string,
    inputs?: Inputs,
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
    return inputs ? { route, inputs } : { route };
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

  return {
    actor: built as unknown as RouterActor,
    view: view as unknown as ViewOf<RouterActor>,
    startAt,
    href,
    /** The Routes it serves: what Start reads a URL and serves the Loaders with. */
    routes,
  };
};
