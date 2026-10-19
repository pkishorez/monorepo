import {
  back,
  backTo,
  cached,
  forward,
  memory,
  preload,
  push,
  reload,
  replace,
} from './capability/index.ts';
import type { AnyRoute } from './capability/index.ts';
import { Page as Pages } from './page/index.ts';
import { NotFoundError, RedirectError, wholeQuery } from './route/index.ts';
import type { RedirectTo } from './route/index.ts';
import { Link, Retry, app, define } from './router/index.ts';

/** A Loader's failure: the place it was asked for is not found. */
const notFound = () => new NotFoundError();

/** How a Redirect is sent: `permanent` is a `308` on the server rather than a `302`. */
interface RedirectOptions {
  readonly permanent?: boolean;
}

/** A URL outside the app, whole: `https://accounts.example.com/sign-in`. */
type Href = `http://${string}` | `https://${string}`;

/**
 * A Loader's failure: the app goes to `route` instead, in place of the move
 * that asked; or, given a whole URL, leaves for it. Either replaces the entry.
 */
function redirect<R extends AnyRoute>(
  route: R,
  options?: RedirectOptions,
): RedirectTo<R>;
function redirect(href: Href, options?: RedirectOptions): RedirectTo<never>;
function redirect(to: AnyRoute | Href, options: RedirectOptions = {}) {
  // A cast string could name a `javascript:` URL, which the browser would run.
  if (typeof to === 'string' && !/^https?:\/\//i.test(to))
    throw new Error(
      `[@kestack/kabuki/routing] a Redirect leaves only for an http or https URL, not ${to}`,
    );
  return new RedirectError({
    ...(typeof to === 'string' ? { href: to } : { route: to }),
    ...(options.permanent ? { permanent: true } : {}),
  });
}

/**
 * Pages: `Page.define` says what one is, an Actor with a place in the URL,
 * and the pages under it; `Page.build` says how it behaves, with the build
 * of each page under it. A page is drawn with `View.make`, as any Actor is.
 * A Loader fails with `Page.notFound()` and `Page.redirect(route or URL)`,
 * whose Schemas are `Page.NotFound` and `Page.Redirect`. `Page.wholeQuery`
 * is a query field holding the whole query, every pair as written.
 */
export const Page = {
  define: Pages.define,
  build: Pages.build,
  notFound,
  redirect,
  wholeQuery,
  NotFound: NotFoundError,
  Redirect: RedirectError,
};

export declare namespace Page {
  /** A Loader's failure: the place is not found. */
  export type NotFound = NotFoundError;
  /** A Loader's failure: go to another Route instead, of type `R` if said, or out of the app. */
  export type Redirect<R = any> = RedirectTo<R>;
}

/**
 * The router: `Router.define` reads an app's router down from its root
 * page's definition; `Router.app` puts it above the root page's View, as
 * `Start.app` does; `Link` and `Retry` draw inside it; `push`, `replace`,
 * `back`, `forward`, `backTo`, `reload` and `preload` are Commands an
 * Update returns; `memory` is a `Loading` that runs the Loaders in place,
 * and `cached` puts the Data cache in front of one.
 */
export const Router = {
  define,
  app,
  Link,
  Retry,
  memory,
  cached,
  push,
  replace,
  back,
  forward,
  backTo,
  reload,
  preload,
};
