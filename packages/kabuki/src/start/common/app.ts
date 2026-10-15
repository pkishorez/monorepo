import type { ComponentType, ReactNode } from 'react';
import type { Layer } from 'effect';
import type { AnyActor, Needs } from '../../core/index.ts';
import type { ViewOf } from '../../react/index.ts';
import type {
  Codec,
  Metadata,
  Place,
  PlaceData,
  PlaceSchema,
} from '../../routing/route/index.ts';

/*
 * What `src/app` hands Start, on both sides: `Start.app(app, { document,
 * layer })`, the app the Router serves, its Document, and what its Actors
 * Require in the browser, checked against them. Start reads nothing else
 * there, so the check cannot be skipped.
 */

/** What Start needs of the app the Router serves: what `Router.app(Routes, AppView)` gives. */
export interface ServedApp {
  readonly actor: AnyActor;
  readonly view: ViewOf<any>;
  /** The Router's Input at a URL, with what its places start from, by dotted name. */
  readonly startAt: (
    url?: string,
    known?: Readonly<Record<string, any>>,
  ) => { readonly route: any; readonly known?: object } | undefined;
  readonly href: (route: any) => string;
  /** The script that puts a page's scroll back before the app hydrates, or `null` where the Router restores none. */
  readonly restoreScroll?: (route: any) => string | null;
  readonly routes: {
    readonly route: Codec<any>;
    readonly path: (route: any) => string;
    readonly metadata: (of: any, data?: PlaceData) => Metadata;
    readonly places: (of: any) => ReadonlyArray<Place>;
    readonly every: ReadonlyArray<PlaceSchema>;
  };
}

export type DocumentType = ComponentType<{ readonly children: ReactNode }>;

const APP = Symbol.for('@kestack/kabuki/start/app');

/** The app and what it needs in the browser: what `src/app` default-exports. */
export interface StartApp<A extends ServedApp = ServedApp> {
  readonly [APP]: true;
  readonly app: A;
  /** The HTML around the app; the plainest one if none. */
  readonly document?: DocumentType;
  /** What the app's Actors Require in the browser, besides the address and the Loaders. */
  readonly layer?: Layer.Layer<any, never, never>;
}

/** The app's Layer, which must cover every Capability the tree still needs. */
type AppOptions<A extends ServedApp> = {
  readonly document?: DocumentType;
} & ([Needs<A['actor']>] extends [never]
  ? { readonly layer?: Layer.Layer<never, never, never> }
  : { readonly layer: Layer.Layer<Needs<A['actor']>, never, never> });

/**
 * The app, its Document, and what its Actors Require in the browser:
 * `export default Start.app(Router.app(Routes, AppView), { document, layer })`.
 * Leaving out a Capability the app Requires is a type error.
 */
export const app = <A extends ServedApp>(
  served: A,
  ...[options]: [Needs<A['actor']>] extends [never]
    ? [options?: AppOptions<A>]
    : [options: AppOptions<A>]
): StartApp<A> => ({ [APP]: true, app: served, ...options }) as StartApp<A>;

/** Why a file's default export is refused: only Start's own values are checked by type. */
export const refused = (file: string, what: string) =>
  new Error(
    `[@kestack/kabuki/start] ${file} must default-export ${what}, so it is checked by type`,
  );

/** Whether `value` is one of Start's own, by its brand. */
export const branded = (value: unknown, brand: symbol) =>
  typeof value === 'object' && value !== null && brand in value;

/** What `src/app` default-exports: `Start.app(…)`, and nothing else, so its Layer is checked. */
export const appOf = (exported: unknown): StartApp => {
  if (branded(exported, APP)) return exported as StartApp;
  throw refused('src/app', 'Start.app(Router.app(Routes, AppView), { … })');
};
