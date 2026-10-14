import { NotFoundError, RedirectError, path, treeWith } from './route/index.ts';
import type {
  Metadata,
  Misdrawn,
  Redirects,
  RouteOf,
  Tree,
} from './route/index.ts';
import {
  Link,
  app,
  back,
  backTo,
  forward,
  memory,
  outletOf,
  push,
  replace,
} from './router/index.ts';
import type { AnyRoute } from './router/index.ts';

type Options<C, D> = {
  readonly redirect?: D & Redirects<C, D>;
  /** The root's Metadata, under every place's: the site's name, its default description. */
  readonly metadata?: Metadata;
  /** The not-found Route's Metadata, over the root's. */
  readonly notFound?: Metadata;
};

/** A tree with a place drawn earlier than the place that holds it names the place, and is refused. */
type Checked<C> = [Misdrawn<C>] extends [never]
  ? unknown
  : {
      readonly 'a place is drawn earlier than the place that holds it': Misdrawn<C>;
    };

/**
 * Every place of an app, as one tree of `Route.path` nodes: a constructor
 * per place, a Schema per node and per Input, the URL both ways, each
 * place's Metadata and Render Mode, the typing of its Loaders, and an
 * outlet per node with children. `redirect` names paths that are never a
 * place, each with the Route that replaces it, from its params; `metadata`
 * is the root's, under every place's, and `notFound` the not-found Route's.
 */
const tree = <
  C extends object,
  const D extends Readonly<
    Record<string, (routes: Tree<C, RouteOf<C>, {}>, params: any) => RouteOf<C>>
  > = {},
>(
  children: C & Checked<C>,
  options?: Options<C, D>,
) =>
  treeWith<C, D>(children, options ?? {}, (node, at) => ({
    outlet: outletOf(node, at),
  }));

/** A Loader's failure: the place it was asked for is not found. */
const notFound = () => new NotFoundError();

/** A Loader's failure: the app goes to `route` instead, in place of the move that asked. */
const redirect = (route: AnyRoute) => new RedirectError({ route });

/**
 * Writing an app's places: `Route.tree` and `Route.path`; and what a
 * Loader fails with, `Route.notFound()` and `Route.redirect(route)`, whose
 * Schemas are `Route.NotFound` and `Route.Redirect`.
 */
export const Route = {
  tree,
  path,
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
 * The router: `Router.app` puts it above an app's root and `Link` draws
 * inside it; `push`, `replace`, `back`, `forward` and `backTo` are Commands
 * an Update returns to move the app; `memory` is a `Loading` that runs the
 * Loaders in place.
 */
export const Router = {
  app,
  Link,
  memory,
  push,
  replace,
  back,
  forward,
  backTo,
};

export type { RouteOf };
