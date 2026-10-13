import { path, treeWith } from './route/index.ts';
import type { RouteOf, Tree } from './route/index.ts';
import {
  Head,
  Link,
  app,
  back,
  backTo,
  forward,
  outletOf,
  push,
  replace,
} from './router/index.ts';

/**
 * Every place of an app, as one tree of `Route.path` nodes: a constructor
 * per place, a Schema per node, the URL both ways, each place's head, and an
 * outlet per node with children. `redirect` names paths that are never a
 * place, each with the Route that replaces it.
 */
const tree = <C extends object>(
  children: C,
  options?: {
    readonly redirect?: Readonly<
      Record<string, (routes: Tree<C, RouteOf<C>, {}>) => RouteOf<C>>
    >;
  },
) =>
  treeWith(children, options ?? {}, (node, at) => ({
    outlet: outletOf(node, at),
  }));

/** Writing an app's places: `Route.tree` and `Route.path`. */
export const Route = { tree, path };

/**
 * The router: `Router.app` puts it above an app's root, `Link` and `Head`
 * draw inside it, and `push`, `replace`, `back`, `forward` and `backTo` are
 * Commands an Update returns to move the app.
 */
export const Router = { app, Link, Head, push, replace, back, forward, backTo };

export type { RouteOf };
