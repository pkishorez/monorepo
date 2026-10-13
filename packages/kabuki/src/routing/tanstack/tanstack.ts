import { Layer } from 'effect';
import { Adapter, KEY, keyIn } from '../adapter/index.ts';

/** The part of a TanStack Router history the Adapter needs: `router.history`. */
export interface TanStackHistory {
  readonly location: {
    readonly pathname: string;
    readonly search: string;
    readonly state: unknown;
  };
  readonly subscribe: (listener: () => void) => () => void;
  readonly push: (path: string, state?: any) => void;
  readonly replace: (path: string, state?: any) => void;
  readonly go: (index: number) => void;
}

/** The router TanStack keeps on `window` in a browser. */
const fromWindow = (): TanStackHistory => {
  const router = (
    globalThis as { __TSR_ROUTER__?: { history: TanStackHistory } }
  ).__TSR_ROUTER__;
  if (!router)
    throw new Error(
      '[@kestack/kabuki/routing] no TanStack Router on this page: pass `history` to tanstack()',
    );
  return router.history;
};

/**
 * TanStack Router's history, for an app on a TanStack Start catch-all route:
 * TanStack hands everything under the app's base to it, and gets back every
 * URL outside it. Every move goes through TanStack's history, so TanStack
 * keeps its own count of where Back goes and matches the same route again
 * without remounting. By default it finds the router TanStack keeps on the
 * page; `history` hands one over instead.
 */
export const tanstack = (options?: {
  readonly history?: () => TanStackHistory;
}) =>
  Layer.sync(Adapter, () => {
    const history = (options?.history ?? fromWindow)();
    return {
      url: () => `${history.location.pathname}${history.location.search}`,
      key: () => keyIn(history.location.state),
      listen: (changed) => history.subscribe(changed),
      push: (url, key) => history.push(url, { [KEY]: key }),
      replace: (url, key) => history.replace(url, { [KEY]: key }),
      go: (by) => history.go(by),
      leave: (url) => history.push(url),
    };
  });
