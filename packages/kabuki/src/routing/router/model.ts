import type { AnyRoute } from '../capabilities/index.ts';
import { Schema } from 'effect';
import type { Effect } from 'effect';
import { Actor } from '../../core/index.ts';
import type { Command } from '../../core/index.ts';
import { moveOptions, reloadOptions } from '../capabilities/index.ts';
import type { MoveOptions, ReloadOptions } from '../capabilities/index.ts';
import type { Known } from '../page/index.ts';
import type {
  Codec,
  How,
  Metadata,
  Place,
  PlaceData,
  PlaceSchema,
  Read,
} from '../route/index.ts';
import { holdingSchema, placeMessages } from './data.ts';
import type { Holding, PlaceMessage } from './data.ts';
import type { AnyPageDefinition } from '../page/index.ts';
import type { Rooted } from './define.ts';

/*
 * What the Router knows: its Model, its Messages and its Input, as types
 * and as the Actor definition whose Schemas check them.
 */

/** What the router needs of its definition. */
export interface RoutesLike<Route> extends Rooted<AnyPageDefinition> {
  readonly route: Codec<Route>;
  /** Every place with data, by dotted name, with its data's Schema. */
  readonly data: ReadonlyArray<readonly [string, Codec<unknown>]>;
  readonly read: (url: string) => Read<Route>;
  readonly path: (route: Route) => string;
  readonly metadata: (of: Route | string, data?: PlaceData) => Metadata;
  readonly places: (of: Route | string) => ReadonlyArray<Place>;
  /** Every place of the tree, as Schemas: what a Loader RPC is made from. */
  readonly every: ReadonlyArray<PlaceSchema>;
}

export const HOW: ReadonlyArray<How> = [
  'load',
  'push',
  'replace',
  'back',
  'forward',
];
/** How a pending move lands: `arrive` is a push the address already shows; `back` and `forward` go to an entry; `reload` stays on the entry shown, its data loaded anew. */
export const LANDS = [
  'push',
  'replace',
  'load',
  'arrive',
  'back',
  'forward',
  'reload',
] as const;
export type Lands = (typeof LANDS)[number];
/** Redirects followed in a row before a move gives up, as not found. */
export const HOPS = 8;

/** A move the Router holds while it loads the data of the places it brings. */
export interface PendingMove<Route> {
  /** Which load this is: an answer for any other is dropped. */
  readonly id: number;
  readonly to: Route;
  readonly how: Lands;
  /** The places being loaded, by dotted name. */
  readonly wanted: ReadonlyArray<string>;
  /** How many Redirects led here. */
  readonly hops: number;
  /** When the move began: it lands without its data `delay` after. */
  readonly since: number;
  /** The key the address already holds for where it goes, from before the page loaded, else `null`: a new entry gets a new one. */
  readonly key: string | null;
  /** What the push or replace said besides where it goes. */
  readonly said?: MoveOptions;
  /** A reload anew's: the Data cache is dropped before it asks, so nothing it loads is a copy, or joins a load asked before. */
  readonly anew?: boolean;
  /** A held reload anew's: it waits for its data however long, and never lands without it. */
  readonly hold?: boolean;
}

/** What a move carries besides where it goes and how. */
export interface Along {
  /** How many Redirects led here. */
  readonly hops?: number;
  /** The key the address already holds for where it goes. */
  readonly key?: string | null;
  readonly said?: MoveOptions | undefined;
}

/** One entry of the history: its key, its Route, and the element on the page it goes to, if any. */
export interface Entry<Route> {
  readonly key: string;
  readonly route: Route;
  readonly hash?: string;
}

/** What a landed move says about its scroll, of what its push or replace said. */
export const scrollOf = (said: MoveOptions | undefined) => ({
  ...(said?.resetScroll === undefined ? {} : { resetScroll: said.resetScroll }),
  ...(said?.hashScrollIntoView === undefined
    ? {}
    : { hashScrollIntoView: said.hashScrollIntoView }),
});

/** What a Pushed or Replaced Message said besides where it goes. */
export const saidOf = ({
  resetScroll,
  hash,
  hashScrollIntoView,
}: MoveOptions): MoveOptions => ({
  ...(resetScroll === undefined ? {} : { resetScroll }),
  ...(hash ? { hash } : {}),
  ...(hashScrollIntoView === undefined ? {} : { hashScrollIntoView }),
});

/** An entry at `route`, with `hash` if there is one. */
export const entryOf = <Route extends AnyRoute>(
  key: string,
  route: Route,
  hash?: string,
) => (hash ? { key, route, hash } : { key, route });

/** The router's Model: the history as entries and where it is in them, the last move, and the one it holds. */
export interface RouterModel<Route> {
  readonly entries: ReadonlyArray<Entry<Route>>;
  readonly at: number;
  /** What every key this page load gives starts with, so no key is given twice across reloads: `m` in memory. */
  readonly session: string;
  /** The number the next entry's key ends with. */
  readonly next: number;
  readonly move: {
    readonly from: Route | null;
    readonly to: Route;
    readonly how: How;
    /** `false`: the push or replace said to leave every scroll as it is. */
    readonly resetScroll?: boolean;
    /** How the push or replace said its hash's element is scrolled into view. */
    readonly hashScrollIntoView?: MoveOptions['hashScrollIntoView'];
  };
  readonly pending: PendingMove<Route> | null;
  /**
   * The Route still drawn while a held Back or Forward loads: the history,
   * like the address, is already at the entry it goes to.
   */
  readonly holding: Route | null;
  /** The id the next pending move gets. */
  readonly loads: number;
  /** The data of each place with data on the Route drawn, by dotted name: each page is handed its own. */
  readonly data: Holding;
  /** How many times the app was reloaded: every place on screen loads its data again when it goes up. */
  readonly reload: number;
  /** Whether an Adapter holds the address. */
  readonly attached: boolean;
  /** Whether the Adapter has said which URL the app opened at. */
  readonly loaded: boolean;
}

export type RouterMessage<Route> =
  | ({ readonly _tag: 'Pushed'; readonly route: Route } & MoveOptions)
  | ({ readonly _tag: 'Replaced'; readonly route: Route } & MoveOptions)
  | { readonly _tag: 'Went'; readonly by: number }
  | { readonly _tag: 'WentBackTo'; readonly route: Route }
  | {
      readonly _tag: 'Arrived';
      readonly route: Route;
      readonly key: string | null;
      readonly url: string;
      /** The element on the page the address names, after its `#`. */
      readonly hash: string;
    }
  | { readonly _tag: 'Attached'; readonly session: string }
  | { readonly _tag: 'Left'; readonly url: string }
  | { readonly _tag: 'Waited'; readonly id: number }
  | {
      readonly _tag: 'Loaded';
      readonly id: number;
      readonly known: Readonly<Record<string, Known>>;
    }
  | { readonly _tag: 'Redirected'; readonly id: number; readonly route: Route }
  | ({ readonly _tag: 'Reloaded' } & ReloadOptions)
  | { readonly _tag: 'Preloading'; readonly route: Route }
  | PlaceMessage;

/** The router's Input: the Route it starts at and what its places already start from. */
export interface RouterInput<Route> {
  readonly route: Route;
  readonly known?: Readonly<Record<string, Known>>;
}

export type Single = { readonly _tag: 'Single' };

/** What the Router's own work Sends it. */
export type Send<Route> = (
  message: RouterMessage<Route>,
) => Effect.Effect<void>;

export type Cmd = Command<unknown, any>;
/** What an Update of the Router returns. */
export type Out = {
  readonly model?: unknown;
  readonly command?: Cmd | ReadonlyArray<Cmd>;
};

/** The Router's definition: every Schema its Model, Messages and Input are checked against, from the Routes. */
export const definitionOf = <Route extends AnyRoute>(
  routes: RoutesLike<Route>,
) => {
  const RouteSchema = routes.route;
  /** What each place with data may start from, by dotted name, each with its own Schema. */
  const KnownSchema = Schema.Struct(
    Object.fromEntries(
      routes.data.map(([name, data]) => [
        name,
        Schema.optionalKey(
          Schema.Union([
            Schema.TaggedStruct('Ready', {
              data,
              stale: Schema.Boolean,
              from: Schema.Literals(['server', 'browser', 'cache']),
              at: Schema.Number,
              took: Schema.NullOr(Schema.Number),
            }),
            Schema.TaggedStruct('Failed', {
              reason: Schema.String,
              notFound: Schema.Boolean,
            }),
          ]),
        ),
      ]),
    ),
  ) as unknown as Codec<Readonly<Record<string, Known>>>;
  const actor = Actor.define('Router', {
    input: Schema.UndefinedOr(
      Schema.Struct({
        route: RouteSchema,
        known: Schema.optionalKey(KnownSchema),
      }),
    ),
    model: Schema.Struct({
      entries: Schema.Array(
        Schema.Struct({
          key: Schema.String,
          route: RouteSchema,
          hash: Schema.optionalKey(Schema.String),
        }),
      ),
      at: Schema.Number,
      session: Schema.String,
      next: Schema.Number,
      move: Schema.Struct({
        from: Schema.NullOr(RouteSchema),
        to: RouteSchema,
        how: Schema.Literals(HOW),
        resetScroll: moveOptions.resetScroll,
        hashScrollIntoView: moveOptions.hashScrollIntoView,
      }),
      pending: Schema.NullOr(
        Schema.Struct({
          id: Schema.Number,
          to: RouteSchema,
          how: Schema.Literals(LANDS),
          wanted: Schema.Array(Schema.String),
          hops: Schema.Number,
          since: Schema.Number,
          key: Schema.NullOr(Schema.String),
          said: Schema.optionalKey(Schema.Struct(moveOptions)),
          anew: Schema.optionalKey(Schema.Boolean),
          hold: Schema.optionalKey(Schema.Boolean),
        }),
      ),
      holding: Schema.NullOr(RouteSchema),
      loads: Schema.Number,
      data: holdingSchema(routes),
      reload: Schema.Number,
      attached: Schema.Boolean,
      loaded: Schema.Boolean,
    }),
    message: Schema.TaggedUnion({
      Pushed: { route: RouteSchema, ...moveOptions },
      Replaced: { route: RouteSchema, ...moveOptions },
      Went: { by: Schema.Number },
      WentBackTo: { route: RouteSchema },
      Arrived: {
        route: RouteSchema,
        key: Schema.NullOr(Schema.String),
        url: Schema.String,
        hash: Schema.String,
      },
      Attached: { session: Schema.String },
      Left: { url: Schema.String },
      Waited: { id: Schema.Number },
      Loaded: { id: Schema.Number, known: KnownSchema },
      Redirected: { id: Schema.Number, route: RouteSchema },
      Reloaded: reloadOptions,
      Preloading: { route: RouteSchema },
      ...placeMessages(routes),
    }),
  } as never);
  return actor;
};
