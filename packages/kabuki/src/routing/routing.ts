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
import { NotFoundError, RedirectError } from './route/index.ts';
import { Link, Retry, app, define } from './router/index.ts';

/** A Loader's failure: the place it was asked for is not found. */
const notFound = () => new NotFoundError();

/** A Loader's failure: the app goes to `route` instead, in place of the move that asked. */
const redirect = (route: AnyRoute) => new RedirectError({ route });

/**
 * Pages: `Page.define` says what one is, an Actor with a place in the URL,
 * and the pages under it; `Page.build` says how it behaves, with the build
 * of each page under it. A page is drawn with `View.make`, as any Actor is.
 * A Loader fails with `Page.notFound()` and `Page.redirect(route)`, whose
 * Schemas are `Page.NotFound` and `Page.Redirect`.
 */
export const Page = {
  define: Pages.define,
  build: Pages.build,
  notFound,
  redirect,
  NotFound: NotFoundError,
  Redirect: RedirectError,
};

export declare namespace Page {
  /** A Loader's failure: the place is not found. */
  export type NotFound = NotFoundError;
  /** A Loader's failure: go to another Route instead. */
  export type Redirect = RedirectError;
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
