import type { AnyRoute } from '../capabilities/index.ts';
import { NotFoundError, RedirectError } from '../route/index.ts';
import type { RedirectTo } from '../route/index.ts';

/*
 * How a Loader fails on purpose: the place is not found, or the app goes to
 * another Route, or out of it, instead.
 */

/** A Loader's failure: the place it was asked for is not found. */
export const notFound = () => new NotFoundError();

/** How a Redirect is sent: `permanent` is a `308` on the server rather than a `302`. */
export interface RedirectOptions {
  readonly permanent?: boolean;
}

/** A URL outside the app, whole: `https://accounts.example.com/sign-in`. */
export type Href = `http://${string}` | `https://${string}`;

/**
 * A Loader's failure: the app goes to `route` instead, in place of the move
 * that asked; or, given a whole URL, leaves for it. Either replaces the entry.
 */
export function redirect<R extends AnyRoute>(
  route: R,
  options?: RedirectOptions,
): RedirectTo<R>;
export function redirect(
  href: Href,
  options?: RedirectOptions,
): RedirectTo<never>;
export function redirect(to: AnyRoute | Href, options: RedirectOptions = {}) {
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
