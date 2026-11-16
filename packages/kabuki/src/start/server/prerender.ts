import { Cause, Effect, Exit, Layer } from 'effect';
import { Loading } from '../../routing/capabilities/index.ts';
import { knownOf } from '../../routing/page/status/index.ts';
import type { Known } from '../../routing/page/status/index.ts';
import { pathsOf } from '../../routing/route/index.ts';
import type { Outcome, PlaceSchema } from '../../routing/route/index.ts';
import { Start } from '../app/index.ts';
import {
  DATA,
  SHELL,
  appOf,
  dataFile,
  loadable,
  pageFile,
  segmentsOf,
  writeLine,
} from '../app/protocol/index.ts';
import { drawer } from './draw.tsx';
import { serverOf } from './layers.ts';
import { lifetimes } from './lifetimes.ts';
import type { HandlerOptions } from './server.tsx';

/*
 * Start at the build: everything that is the same for everyone until the
 * next deploy, drawn before anyone asks. A static place's Loader runs
 * here, once, and never for a request.
 *
 * 1. List   every path each static place is at. One whose own path names
 *           params says them, `paths` in its Loader, each with every param
 *           down to it; one with none is wherever the page above it is.
 *           A path under one the page above does not list is refused.
 *           A client page with no params of its own is wherever the page
 *           above it is too, if that page is listed.
 * 2. Load   each static place with data at each of its paths, a few at a
 *           time, with the Loaders' layer made from the build's env. A
 *           listed path must load: not found, a Redirect or a broken
 *           Loader fails the build. Its answer is written as the Static Data,
 *           `_kabuki/data/<build>/Blog.Post/hello.json`.
 * 3. Draw   the URL that ends at each listed page, at each of its paths,
 *           from those answers, as the server would, and write its HTML at
 *           that URL: `blog/hello.html`. A client page is drawn loading,
 *           under the static pages above it, as the server draws it.
 *           Then the App Shell, `_kabuki/shell.html`, which is the same
 *           for every URL.
 *
 * What the build cannot know is the server's: a URL under a dynamic page,
 * one whose client page names params, or one a client root draws, which
 * the server answers with the App Shell the build wrote.
 */

/** Writes one file beside the client's, by its path from their folder. */
export type Write = (file: string, body: string) => Promise<void>;

/** What a build drew: the URL of each page it wrote, and how many answers it kept. */
export interface Prerendered {
  readonly pages: ReadonlyArray<string>;
  readonly data: number;
}

type Params = Readonly<Record<string, unknown>>;

/** How many Loaders run at once: a build asks for every path, and what answers may be one small service. */
const AT_ONCE = 8;

const refused = (why: string, cause?: unknown) =>
  new Error(
    `[@kestack/kabuki/start] the build cannot draw the app: ${why}`,
    cause === undefined ? undefined : { cause },
  );

/** Why a listed path did not load. */
const whyOf = (outcome: Outcome) => {
  switch (outcome._tag) {
    case 'NotFound':
      return 'is not found';
    case 'Redirect':
      return 'Redirects';
    case 'Broken':
      return `broke: ${outcome.reason}`;
    case 'Loaded':
      return 'loaded';
  }
};

/**
 * Draws every static page of the app, and keeps each static place's
 * answer: what the Vite plugin runs once the client is built, handing it
 * how to write a file beside the client's and the build's env.
 */
export const prerender = (options: HandlerOptions) => {
  const { build } = options;
  const { app, document = Start.Document, loading: shown } = appOf(options.app);
  const { loaders, layers } = serverOf(options.server);
  const routes = app.routes;
  const draw = drawer(app, document, build, shown);
  const byName = new Map(routes.every.map((place) => [place.name, place]));
  const places = loadable(routes);
  const statics = routes.every.filter((place) => place.render === 'static');
  /** The pages the build may draw: every static one, and every client one, unless the root is. */
  const drawable = routes.every.filter(
    (place) =>
      place.render === 'static' ||
      (place.render === 'client' && routes.render !== 'client'),
  );

  /** A place at one of its paths: its name and its path params, as its URL writes them. */
  const keyOf = (place: PlaceSchema, params: Params) => {
    try {
      return JSON.stringify([place.name, segmentsOf(place, params)]);
    } catch (cause) {
      throw refused(
        `${JSON.stringify(params)} are not the path params of ${place.name}`,
        cause,
      );
    }
  };

  /** The Route that ends at a place, from its path params. */
  const routeOf = (name: string, params: Params): unknown =>
    (
      name.split('.').reduce<any>((at, tag) => at[tag], routes) as (
        params: Params,
      ) => unknown
    )(params);

  /** The path of a Route, without its query. */
  const pathOf = (route: unknown) => routes.path(route).split('?')[0]!;
  const written = routes.paths();

  /** The nearest static page above a place, whose paths a client page under it is drawn at. */
  const staticAbove = (name: string): PlaceSchema | undefined => {
    const cut = name.lastIndexOf('.');
    if (cut < 0) return undefined;
    const parent = byName.get(name.slice(0, cut))!;
    return parent.render === 'static' ? parent : staticAbove(parent.name);
  };

  /** The URL that ends at a client page, at a path its static pages list: it names no params of its own. */
  const clientPath = (place: PlaceSchema, params: Params) => {
    const above = staticAbove(place.name);
    const segments = above ? segmentsOf(above, params) : [];
    let next = 0;
    return written[place.name]!.split('/')
      .map((part) =>
        part.startsWith(':') ? encodeURIComponent(segments[next++]!) : part,
      )
      .join('/');
  };

  /**
   * The Route a page is drawn at, at one of its paths, as the server reads
   * its URL. None where that URL reads as the page's index under it, which
   * is drawn there instead, or where a client page's needs a query, which
   * is the server's. A static page's that reads as no page cannot be drawn.
   */
  const drawnAt = (place: PlaceSchema, params: Params): unknown => {
    let path: string;
    try {
      path =
        place.render === 'static'
          ? pathOf(routeOf(place.name, params))
          : clientPath(place, params);
    } catch (cause) {
      throw refused(
        `the URL of ${place.name} at ${JSON.stringify(params)} cannot be written with no query, and the build draws a static page with none`,
        cause,
      );
    }
    const route = app.startAt(path)?.route;
    const ends =
      route === undefined ? undefined : routes.places(route).at(-1)?.name;
    if (ends === place.name && pathOf(route) === path) return route;
    if (place.render === 'client' || ends?.startsWith(`${place.name}.`))
      return undefined;
    throw refused(
      `${place.name} is static, and its URL ${path} reads as ${ends ?? 'no page'}, so the build cannot draw it there`,
    );
  };

  // 1. List
  const list = Effect.gen(function* () {
    const listed = new Map<string, ReadonlyArray<Params>>();
    for (const place of drawable) {
      const cut = place.name.lastIndexOf('.');
      const parent = cut < 0 ? undefined : byName.get(place.name.slice(0, cut));
      // A client page is drawn only where the build drew the page above it.
      if (place.render === 'client') {
        const above = parent ? listed.get(parent.name) : [{}];
        if (above && !place.lists)
          listed.set(
            place.name,
            above.filter((params) => drawnAt(place, params) !== undefined),
          );
        continue;
      }
      const above: ReadonlyArray<Params> = parent
        ? (listed.get(parent.name) ?? [])
        : [{}];
      if (!place.lists) {
        listed.set(place.name, above);
        continue;
      }
      const paths = pathsOf(loaders[place.name]);
      if (!paths)
        return yield* Effect.die(
          refused(
            `${place.name} is static and its path names params, so its Loader lists every path it is at: { paths, load }`,
          ),
        );
      const given = yield* paths().pipe(
        Effect.mapError((cause) =>
          refused(`the paths of ${place.name} could not be listed`, cause),
        ),
        Effect.orDie,
      );
      const known = parent
        ? new Set(above.map((params) => keyOf(parent, params)))
        : undefined;
      const seen = new Set<string>();
      const own: Array<Params> = [];
      for (const params of given) {
        const key = keyOf(place, params);
        if (seen.has(key)) continue;
        seen.add(key);
        if (parent && known && !known.has(keyOf(parent, params)))
          return yield* Effect.die(
            refused(
              `${place.name} lists ${JSON.stringify(params)}, under a path ${parent.name} does not list`,
            ),
          );
        own.push(params);
      }
      listed.set(place.name, own);
    }
    return listed;
  });

  return async (write: Write, env: unknown = {}): Promise<Prerendered> => {
    const id = build.id;
    if (id === undefined)
      throw refused('only a build draws the static pages, and this is none');
    const written = new Set<string>();
    const once = (file: string, body: string) => {
      if (written.has(file))
        throw refused(`two of its pages are written to ${file}`);
      written.add(file);
      return write(file, body);
    };
    // What the Loaders load with, and what they list their paths with: the layer, and never the visitor.
    const loading = Loading.memory(routes, loaders as never).pipe(
      Layer.provideMerge(
        lifetimes(layers)({
          env,
          request: new Request('http://build/'),
          headers: new Headers(),
          visitor: false,
        }),
      ),
    ) as Layer.Layer<any>;

    const drawn = Effect.gen(function* () {
      const listed = yield* list;
      // 2. Load
      const answers = new Map<string, Outcome>();
      const wanted = statics.flatMap((place) =>
        place.input
          ? (listed.get(place.name) ?? []).map((params) => ({ place, params }))
          : [],
      );
      const load = (yield* Loading).load;
      yield* Effect.forEach(
        wanted,
        ({ place, params }) =>
          Effect.gen(function* () {
            const { name } = place;
            const outcome: Outcome = (yield* load([{ name, params }]))[
              name
            ] ?? { _tag: 'Broken', reason: `no answer for ${name}` };
            if (outcome._tag !== 'Loaded')
              return yield* Effect.die(
                refused(
                  `${name} at ${JSON.stringify(params)} ${whyOf(outcome)}, and a path a static place lists must load`,
                ),
              );
            answers.set(keyOf(place, params), outcome);
            const line = writeLine(routes, places, { name, outcome });
            yield* Effect.promise(() =>
              once(
                `${DATA}/${id}/${dataFile(place, params)}`,
                JSON.stringify(line.outcome),
              ),
            );
          }),
        { concurrency: AT_ONCE, discard: true },
      );
      // 3. Draw
      const pages: Array<string> = [];
      const now = Date.now();
      for (const place of drawable)
        for (const params of listed.get(place.name) ?? []) {
          const route = drawnAt(place, params);
          if (route === undefined) continue;
          const known: Record<string, Known> = {};
          for (const on of routes.places(route)) {
            if (on.render !== 'static') continue;
            const outcome = answers.get(keyOf(byName.get(on.name)!, on.params));
            if (outcome) known[on.name] = knownOf(outcome, now, 'server')!;
          }
          const path = pathOf(route);
          const html = yield* Effect.promise(() => draw.page({ route, known }));
          yield* Effect.promise(() => once(pageFile(path), html));
          pages.push(path);
        }
      const shell = yield* Effect.promise(() => draw.shell());
      yield* Effect.promise(() => once(pageFile(SHELL), shell));
      return { pages, data: wanted.length };
    }).pipe(Effect.provide(loading));

    const exit = await Effect.runPromiseExit(
      drawn as Effect.Effect<Prerendered>,
    );
    if (Exit.isSuccess(exit)) return exit.value;
    throw Cause.squash(exit.cause);
  };
};
