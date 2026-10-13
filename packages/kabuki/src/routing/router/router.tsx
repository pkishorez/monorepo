import { Effect, Layer, Option, Queue, Schema, Stream } from 'effect';
import type { MouseEvent } from 'react';
import { Actor, Command } from '../../core/index.ts';
import type { ActorType, AnyActor, Types } from '../../core/index.ts';
import { View } from '../../react/index.ts';
import type { ViewOf } from '../../react/index.ts';
import { Adapter } from '../adapter/index.ts';
import type { Codec, Head, How, Read } from '../route/index.ts';
import { HeadWriter, RouterContext, useTitle } from './context.tsx';
import type { Drawing, Entry } from './context.tsx';
import { Navigation } from './navigation.ts';
import type { AnyRoute } from './navigation.ts';

/** What the router needs of a Routes tree. */
export interface RoutesLike<Route> {
  readonly route: Codec<Route>;
  readonly read: (url: string) => Read<Route>;
  readonly path: (route: Route) => string;
  readonly head: (of: Route | string) => Head;
}

const HOW: ReadonlyArray<How> = ['load', 'push', 'replace', 'back', 'forward'];

/** The router's Model: the history as entries and where it is in them, and the last move. */
export interface RouterModel<Route> {
  readonly entries: ReadonlyArray<{
    readonly key: string;
    readonly route: Route;
  }>;
  readonly at: number;
  /** The key the next entry gets. */
  readonly next: number;
  readonly move: {
    readonly from: Route | null;
    readonly to: Route;
    readonly how: How;
  };
  /** Whether an Adapter holds the address. */
  readonly attached: boolean;
  /** Whether the Adapter has said which URL the app opened at. */
  readonly loaded: boolean;
}

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
  | { readonly _tag: 'Left'; readonly url: string };

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

/**
 * The router of an app: one Actor, above the app's own root. It holds the
 * history, as entries and where it is in them, and hands the app the
 * current Route as Props, `{ page }`. Every move is one Message to it: a
 * link click, a Request on Navigation, the Adapter's Back and Forward. It
 * draws the app, catches plain clicks on links inside it, and writes the
 * head. With no Adapter in the Layer it routes in memory; with one, it
 * writes each move to the address with a Command, and hears the address
 * with a Worker.
 */
export const app = <Route extends AnyRoute, A extends AnyActor>(
  routes: RoutesLike<Route>,
  page: { readonly actor: A; readonly view: ViewOf<A> },
  options?: {
    /** Where the app is mounted, like `/app`: every link and URL is under it. */
    readonly base?: string;
  },
) => {
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

  const RouteSchema = routes.route;
  const actor = Actor.make('Router', {
    input: Schema.UndefinedOr(RouteSchema),
    model: Schema.Struct({
      entries: Schema.Array(
        Schema.Struct({ key: Schema.String, route: RouteSchema }),
      ),
      at: Schema.Number,
      next: Schema.Number,
      move: Schema.Struct({
        from: Schema.NullOr(RouteSchema),
        to: RouteSchema,
        how: Schema.Literals(HOW),
      }),
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
    }),
  } as never) as unknown as {
    build: (behavior: unknown) => AnyActor;
  };

  type Model = RouterModel<Route>;
  const current = (model: Model) => model.entries[model.at]!;
  const moved = (model: Model, to: number, how: How): Model => ({
    ...model,
    at: to,
    move: { from: current(model).route, to: model.entries[to]!.route, how },
  });
  const replaced = (model: Model, route: Route): Model => ({
    ...model,
    entries: model.entries.map((entry, index) =>
      index === model.at ? { key: entry.key, route } : entry,
    ),
    move: { from: current(model).route, to: route, how: 'replace' },
  });
  const pushed = (model: Model, route: Route): Model => ({
    ...model,
    entries: [
      ...model.entries.slice(0, model.at + 1),
      { key: String(model.next), route },
    ],
    at: model.at + 1,
    next: model.next + 1,
    move: { from: current(model).route, to: route, how: 'push' },
  });
  const going = (model: Model, by: number) => {
    const to = Math.min(Math.max(model.at + by, 0), model.entries.length - 1);
    if (to === model.at) return {};
    return {
      model: moved(model, to, to < model.at ? 'back' : 'forward'),
      command: go({ by: to - model.at }),
    };
  };
  const writing = (model: Model, replace: boolean) =>
    write({
      url: href(current(model).route),
      key: current(model).key,
      replace,
    });

  const built = actor.build({
    init: (from: Route | undefined) => {
      const route = from ?? start();
      return {
        model: {
          entries: [{ key: '0', route }],
          at: 0,
          next: 1,
          move: { from: null, to: route, how: 'load' },
          attached: false,
          loaded: false,
        } satisfies Model,
      };
    },
    children: { page: page.actor },
    invoke: ({ model }: { readonly model: Model }) => ({
      page: { props: { page: current(model).route } },
    }),
    provides: (self: {
      readonly send: (message: RouterMessage<Route>) => Effect.Effect<void>;
    }) =>
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
        if (same(route, current(model).route)) return {};
        const next = pushed(model, route);
        return { model: next, command: writing(next, false) };
      },
      Replaced: (
        { route }: { readonly route: Route },
        { model }: { readonly model: Model },
      ) => {
        const next = replaced(model, route);
        return { model: next, command: writing(next, true) };
      },
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
        const next = replaced(model, route);
        return { model: next, command: writing(next, true) };
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
      ) => {
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
                index === known ? { key: entry.key, route } : entry,
              ),
            },
            known,
            known < model.at ? 'back' : 'forward',
          );
          return canonical
            ? { model: at }
            : { model: at, command: writing(at, true) };
        }
        if (!model.loaded) {
          // The URL the app opened at: this entry, now with the router's key.
          const opened: Model = {
            ...model,
            loaded: true,
            entries: model.entries.map((entry, index) =>
              index === model.at ? { key: entry.key, route } : entry,
            ),
            move: same(route, current(model).route)
              ? model.move
              : { from: null, to: route, how: 'load' },
          };
          return { model: opened, command: writing(opened, true) };
        }
        // A URL the app did not write: typed in, or a link from the rest of the site.
        const next = pushed(model, route);
        return { model: next, command: writing(next, true) };
      },
      Attached: (_: unknown, { model }: { readonly model: Model }) => ({
        model: { ...model, attached: true },
      }),
      Left: ({ url }: { readonly url: string }) => ({
        command: leave({ url }),
      }),
    },
    workers: {
      // Hears the address, if an Adapter holds one: Back, Forward, a typed URL.
      address: {
        run: (self: {
          readonly send: (message: RouterMessage<Route>) => Effect.Effect<void>;
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
                // The Router's own write coming back: nothing moved.
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

  /** What the View draws, with the one piece of drawing state: a title a page drew. */
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
    const title = useTitle();
    const head = routes.head(current(model).route);
    const drawing: Drawing = {
      href: href as (route: AnyRoute) => string,
      entries: model.entries as ReadonlyArray<Entry>,
      at: model.at,
      move: model.move,
      attached: model.attached,
      head,
      go: (by) => send({ _tag: 'Went', by }),
      title,
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
        {model.attached && <HeadWriter title={title.value ?? head.title} />}
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
   * The Route the browser's URL names now, for `toReact`'s `input`, so an
   * app on an Adapter is drawn at the right page from the first frame. On
   * a server, or in memory, it is the start.
   */
  const startAt = (): Route | undefined => {
    if (typeof location === 'undefined') return undefined;
    const url = inside(`${location.pathname}${location.search}`);
    return url === undefined ? undefined : routes.read(url).route;
  };

  return {
    actor: built as unknown as ActorType<
      'Router',
      Route | undefined,
      void,
      RouterModel<Route>,
      Single,
      RouterMessage<Route>,
      { readonly Single: { readonly page: A } },
      Exclude<Types<A>['open'], Navigation>
    >,
    view: view as unknown as ViewOf<
      ActorType<
        'Router',
        Route | undefined,
        void,
        RouterModel<Route>,
        Single,
        RouterMessage<Route>,
        { readonly Single: { readonly page: A } },
        Exclude<Types<A>['open'], Navigation>
      >
    >,
    startAt,
    href,
  };
};
