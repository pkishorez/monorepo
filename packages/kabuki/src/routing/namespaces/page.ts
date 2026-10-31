import { Page as Pages } from '../page/index.ts';
import { NotFoundError, RedirectError } from '../route/index.ts';
import type { RedirectTo } from '../route/index.ts';

/*
 * `Page`: what a page is, `define`, an Actor with a place in the URL and the
 * pages under it; how it behaves, `build`; and how its Loader fails on
 * purpose, `notFound()` and `redirect(route or URL)`, whose Schemas are
 * `NotFound` and `Redirect`. `wholeQuery` is a query field holding the
 * whole query, every pair as written.
 */

/** What a page is: where it is in the URL, what it loads, the pages under it, and its Actor's Schemas. */
export const define = Pages.define;
/** How a page behaves, with the build of each page under it. */
export const build = Pages.build;

export { notFound, redirect } from '../page/index.ts';
export { wholeQuery } from '../route/index.ts';

/** A Loader's failure, and its Schema: the place is not found. */
export const NotFound = NotFoundError;
export type NotFound = NotFoundError;
/** A Loader's failure, and its Schema: go to another Route instead, of type `R` if said, or out of the app. */
export const Redirect = RedirectError;
export type Redirect<R = any> = RedirectTo<R>;

export type {
  /** A page, as `define` gives it. */
  PageDefinition as Definition,
  /** A page, as `build` gives it. */
  PageBuild as Build,
  AnyPageDefinition as AnyDefinition,
  AnyPageBuild as AnyBuild,
  Href,
  RedirectOptions,
  Status,
} from '../page/index.ts';
export type { Metadata, RedirectTo } from '../route/index.ts';
