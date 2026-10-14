import {
  Loading,
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
import { page, tree, view } from './page/index.ts';
import { NotFoundError, RedirectError } from './route/index.ts';
import { Link, Retry, app } from './router/index.ts';

/** A Loader's failure: the place it was asked for is not found. */
const notFound = () => new NotFoundError();

/** A Loader's failure: the app goes to `route` instead, in place of the move that asked. */
const redirect = (route: AnyRoute) => new RedirectError({ route });

/**
 * Writing an app's pages: `Route.page` makes one, an Actor with a place in
 * the URL; `Route.view` draws it; `Route.tree` reads the Routes down from
 * the root page. A Loader fails with `Route.notFound()` and
 * `Route.redirect(route)`, whose Schemas are `Route.NotFound` and
 * `Route.Redirect`.
 */
export const Route = {
  page,
  view,
  tree,
  notFound,
  redirect,
  NotFound: NotFoundError,
  Redirect: RedirectError,
};

export declare namespace Route {
  /** A Loader's failure: the place is not found. */
  export type NotFound = NotFoundError;
  /** A Loader's failure: go to another Route instead. */
  export type Redirect = RedirectError;
}

/**
 * The router: `Router.app` puts it above an app's root page, and `Link` and
 * `Retry` draw inside it; `push`, `replace`, `back`, `forward`, `backTo`,
 * `reload` and `preload` are Commands an Update returns; `memory` is a
 * `Loading` that runs the Loaders in place, and `cached` puts the Data
 * cache in front of one.
 */
export const Router = {
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

export { Loading };
