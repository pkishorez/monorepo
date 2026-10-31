import type { ComponentType, ReactNode } from 'react';
import type { Layer } from 'effect';
import type { Attachment, ViewOf } from '../../../react/view/index.ts';
import type {
  Codec,
  Metadata,
  Place,
  PlaceData,
  PlaceSchema,
} from '../../../routing/route/index.ts';

/*
 * The app as Start holds it, on both sides: what `Start.app` makes, branded
 * so the server and the browser take only Start's own value from `src/app`.
 */

/** What Start needs of the app the Router serves: what `Router.app(router, AppView)` gives. */
export type ServedApp = ViewOf<any> & {
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
    /** Every place's path, as written from the root, by dotted name. */
    readonly paths: () => Readonly<Record<string, string>>;
    readonly metadata: (of: any, data?: PlaceData) => Metadata;
    readonly places: (of: any) => ReadonlyArray<Place>;
    readonly every: ReadonlyArray<PlaceSchema>;
  };
};

export type DocumentType = ComponentType<{ readonly children: ReactNode }>;

export const APP = Symbol.for('@kestack/kabuki/start/app');

/** The app and what it needs in the browser: what `src/app` default-exports. */
export interface StartApp<A extends ServedApp = ServedApp> {
  readonly [APP]: true;
  readonly app: A;
  /** What the app is called in the browser; the root Actor's name, `Router`, if none. */
  readonly name?: string;
  /** The HTML around the app; the plainest one if none. */
  readonly document?: DocumentType;
  /** What the app's Actors Require in the browser, besides the address and the Loaders. */
  readonly layer?: Layer.Layer<any, never, never>;
  /** What runs beside the app in the browser, such as a devtool. */
  readonly attach?: ReadonlyArray<Attachment>;
}

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
  throw refused('src/app', 'Start.app({ router, view, … })');
};
