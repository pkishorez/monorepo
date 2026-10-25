import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as Schema from 'effect/Schema';
import { type BuildId, precacheCacheName } from '../../contract/build/index.js';
import {
  attempt,
  fetchNetwork,
  GlobalScope,
  openCache,
} from '../global-scope/index.js';
import { downloadEntry } from './download.js';
import { matchPrecache } from './precache.js';

/*
 * What Kabuki Start says of the app's pages, asked when the worker
 * installs and kept in this build's Precache beside the App Shell and the
 * static pages without params. The path is written here rather than
 * imported, so the worker carries none of Start. An app not on Start, or
 * Start in dev without a build, answers nothing usable: the worker then
 * installs with the assets alone and treats every page as dynamic.
 */

/** Where Kabuki Start answers its Pages. */
export const PAGES_URL = '/_kabuki/pages';

const Render = Schema.Literals(['static', 'dynamic', 'client']);
export type Render = typeof Render.Type;

const Page = Schema.Struct({
  path: Schema.String,
  params: Schema.Boolean,
  render: Render,
});
type Page = typeof Page.Type;

export const Pages = Schema.Struct({
  shell: Schema.String,
  pages: Schema.Array(Page),
});
export type Pages = typeof Pages.Type;

const decode = (json: unknown): Option.Option<Pages> =>
  Schema.decodeUnknownOption(Pages)(json);

/**
 * Asks Start for its Pages and saves them, the App Shell and every static
 * page without params into this build's Precache. No Pages is no failure;
 * a Pages whose App Shell will not download fails install, as an asset
 * would. A static page that will not download is left to the network.
 */
export const installPages = (
  buildId: BuildId,
): Effect.Effect<void, Error, GlobalScope> =>
  Effect.gen(function* () {
    const scope = yield* GlobalScope;
    const response = yield* fetchNetwork(PAGES_URL, { cache: 'reload' }).pipe(
      Effect.option,
    );
    if (Option.isNone(response) || !response.value.ok) return;
    const body = yield* attempt(() => response.value.text()).pipe(
      Effect.orElseSucceed(() => ''),
    );
    const pages = Option.liftThrowable(JSON.parse)(body).pipe(
      Option.flatMap(decode),
    );
    if (Option.isNone(pages)) return;
    const cache = yield* openCache(precacheCacheName(buildId));
    const url = (path: string) => new URL(path, scope.origin).href;
    yield* downloadEntry(cache, url(pages.value.shell));
    yield* Effect.forEach(
      pages.value.pages.filter(
        (page) => page.render === 'static' && !page.params,
      ),
      (page) => downloadEntry(cache, url(page.path)).pipe(Effect.ignore),
      { discard: true, concurrency: 8 },
    );
    yield* attempt(() =>
      cache.put(
        url(PAGES_URL),
        new Response(body, {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  });

/** This build's Pages, as saved when it installed. */
export const readPages = (
  buildId: BuildId,
): Effect.Effect<Option.Option<Pages>, never, GlobalScope> =>
  Effect.gen(function* () {
    const saved = yield* matchPrecache(buildId, PAGES_URL);
    if (Option.isNone(saved)) return Option.none();
    const json = yield* attempt(() => saved.value.json()).pipe(Effect.option);
    return Option.flatMap(json, decode);
  });

const segments = (path: string) => path.split('/').filter(Boolean);

const matches = (pattern: string, pathname: string): boolean => {
  const want = segments(pattern);
  const have = segments(pathname);
  return (
    want.length === have.length &&
    want.every((part, at) => part.startsWith(':') || part === have[at])
  );
};

/** The page a path lands on: one with no params first, as a router picks it. */
export const pageAt = (pages: Pages, pathname: string): Option.Option<Page> =>
  Option.fromNullishOr(
    pages.pages.find((page) => !page.params && matches(page.path, pathname)) ??
      pages.pages.find((page) => page.params && matches(page.path, pathname)),
  );
