import type { AnyRoute } from '../capabilities/index.ts';
import type { RoutesLike } from './model.ts';

/*
 * The Router's URLs: a Route written under the app's base, a URL read back
 * inside it, and whether a URL already shows a Route.
 */
export const urlsOf = <Route extends AnyRoute>(routes: RoutesLike<Route>) => {
  const { base } = routes.options;
  const href = (route: Route) => {
    const path = routes.path(route);
    return base && path === '/' ? base : `${base}${path}`;
  };
  /** A URL inside the base, without it; `undefined` for a URL outside. */
  const inside = (url: string): string | undefined => {
    if (!base) return url;
    if (url === base) return '/';
    if (url.startsWith(`${base}/`)) return url.slice(base.length);
    if (url.startsWith(`${base}?`)) return `/${url.slice(base.length)}`;
    return undefined;
  };
  const same = (a: Route, b: Route) => routes.path(a) === routes.path(b);
  /**
   * Whether `url` is how `route` is written, give or take query params no
   * page reads, like `?utm_source=`: such a URL is left in the address as
   * it is, and every move the app makes writes its Route alone.
   */
  const shows = (url: string, route: Route) => {
    const written = routes.path(route);
    if (url === written) return true;
    const [path, query = ''] = url.split('?');
    const [want, wanted = ''] = written.split('?');
    if (path !== want) return false;
    const reads = new URLSearchParams(wanted);
    const read = new URLSearchParams(
      Array.from(new URLSearchParams(query)).filter(([name]) =>
        reads.has(name),
      ),
    );
    return read.toString() === reads.toString();
  };
  /** A URL inside the base, with it. */
  const withBase = (url: string) => {
    if (!base) return url;
    if (url === '/') return base;
    return url.startsWith('/?') ? `${base}${url.slice(1)}` : `${base}${url}`;
  };
  const start = () => routes.read('/').route;
  const notFound = (route: Route) =>
    ({ _tag: 'NotFound', path: routes.path(route) }) as unknown as Route;
  return { href, inside, same, shows, withBase, start, notFound };
};

export type Urls<Route extends AnyRoute> = ReturnType<typeof urlsOf<Route>>;
