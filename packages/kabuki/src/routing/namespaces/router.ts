/*
 * `Router`: an app's router read down from its root page's definition,
 * `define`; put above the root page's View, `app`, as `Start.app` does;
 * `Link` and `Retry`, drawn inside it; and the moves an Update returns as
 * Commands: `push`, `replace`, `back`, `forward`, `backTo`, `reload` and
 * `preload`.
 */

export { app, define, Link, Retry } from '../router/index.ts';
export {
  back,
  backTo,
  forward,
  preload,
  push,
  reload,
  replace,
} from '../capabilities/index.ts';

export type {
  /** A router, as `define` gives it. */
  RouterDefinition as Definition,
  AnyRouterDefinition as AnyDefinition,
  RouterOptions as Options,
  Preload,
} from '../router/index.ts';
export type { MoveOptions, ReloadOptions } from '../capabilities/index.ts';
