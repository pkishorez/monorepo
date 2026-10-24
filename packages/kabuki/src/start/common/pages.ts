import type { PlaceSchema, RenderMode } from '../../routing/route/index.ts';

/*
 * What Start tells anything in front of the app about its pages, such as a
 * service worker, without knowing what it is: each page with how its first
 * drawing is made, and the App Shell. Both are served by the handler, which
 * holds the Routes, so they cannot disagree with them.
 *
 *   GET /_kabuki/pages   the Pages, as JSON
 *   GET /_kabuki/shell   the App Shell: the Document with the app drawn by
 *                        the browser, at whatever URL it is opened on
 */

/** Where the server answers the Pages. */
export const PAGES = '/_kabuki/pages';
/** Where the server answers the App Shell. */
export const SHELL = '/_kabuki/shell';

/** One page of the app: a place a URL can end at. */
export interface PageInfo {
  /** Its dotted name, as the Loaders name it: `Blog.Post`. */
  readonly name: string;
  /** Its path as written from the root: `/blog/:slug`. */
  readonly path: string;
  /** Whether its path has params, so it is many URLs, not one. */
  readonly params: boolean;
  /**
   * How its first drawing is made, as the server does it: `static` when
   * every place the server draws is static, so it is the same for everyone
   * until the next deploy; `client` when the server draws none of it, so the
   * App Shell is all of it; `dynamic` otherwise.
   */
  readonly render: RenderMode;
}

/** What `GET /_kabuki/pages` answers. */
export interface Pages {
  /** The build that answers; `null` in dev. */
  readonly build: string | null;
  /** Where the App Shell is served. */
  readonly shell: string;
  readonly pages: ReadonlyArray<PageInfo>;
}

/** How a page's first drawing is made, from the Render Modes of the places on its path, the root first. */
const renderOf = (modes: ReadonlyArray<RenderMode>): RenderMode => {
  const client = modes.indexOf('client');
  const here = client < 0 ? modes : modes.slice(0, client);
  if (here.length === 0) return 'client';
  return here.every((mode) => mode === 'static') ? 'static' : 'dynamic';
};

/** Every page of the Routes, from every place and its path. */
export const pagesOf = (
  every: ReadonlyArray<PlaceSchema>,
  paths: Readonly<Record<string, string>>,
  build: string | undefined,
): Pages => {
  const modes = new Map(every.map((place) => [place.name, place.render]));
  return {
    build: build ?? null,
    shell: SHELL,
    pages: every.map(({ name }) => {
      const path = paths[name] ?? '/';
      const parts = name.split('.');
      return {
        name,
        path,
        params: path.split('/').some((part) => part.startsWith(':')),
        render: renderOf(
          parts.map((_, at) => modes.get(parts.slice(0, at + 1).join('.'))!),
        ),
      };
    }),
  };
};
