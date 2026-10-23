import { Context, Schema } from 'effect';
import type { Effect } from 'effect';
import { Command } from '../../core/index.ts';

/** A Route of any app: what the router moves to. */
export type AnyRoute = { readonly _tag: string };

/** How an element is scrolled into view: as `Element.scrollIntoView` takes it. */
export interface HashScrollOptions {
  readonly behavior?: 'auto' | 'instant' | 'smooth';
  readonly block?: 'start' | 'center' | 'end' | 'nearest';
  readonly inline?: 'start' | 'center' | 'end' | 'nearest';
}

/** What a push or replace may say besides where it goes, as TanStack Router's navigations say it. */
export interface MoveOptions {
  /** `false`: the move leaves every scroll as it is, restoring and resetting nothing. */
  readonly resetScroll?: boolean;
  /** The element the move goes to on the page, by its id: `#setup`. */
  readonly hash?: string;
  /** How that element is scrolled into view; `false` leaves it. */
  readonly hashScrollIntoView?: boolean | HashScrollOptions;
}

/** What a reload may say. */
export interface ReloadOptions {
  /**
   * `true`: the data shown is no one's any more, as after the signed-in
   * account changed. It is not shown behind the load: the Router holds it as
   * a move, up to its delay, then each page shows it is loading.
   */
  readonly anew?: boolean;
  /**
   * With `anew`: the Router holds the data shown until the new data comes,
   * however long, and no page shows it is loading; the new data then takes
   * its place in one step. Whoever asked shows that it is under way: the
   * reload, as a Command, ends once it lands, or once a move takes its
   * place.
   */
  readonly hold?: boolean;
}

/** The Schema of a reload's options, for the Message that carries them. */
export const reloadOptions = {
  anew: Schema.optionalKey(Schema.Boolean),
  hold: Schema.optionalKey(Schema.Boolean),
};

const position = Schema.optionalKey(
  Schema.Literals(['start', 'center', 'end', 'nearest']),
);

/** The Schemas of a move's options, for the Messages that carry them. */
export const moveOptions = {
  resetScroll: Schema.optionalKey(Schema.Boolean),
  hash: Schema.optionalKey(Schema.String),
  hashScrollIntoView: Schema.optionalKey(
    Schema.Union([
      Schema.Boolean,
      Schema.Struct({
        behavior: Schema.optionalKey(
          Schema.Literals(['auto', 'instant', 'smooth']),
        ),
        block: position,
        inline: position,
      }),
    ]),
  ),
};

/**
 * The Capability the router Provides to everything below it: Requests that
 * move the app, each one Message to the router, with who asked. Every page
 * Requires it, so a page's Update returns `Router.push(…)` and the like as
 * Commands; any other Actor below the router lists it in its Requires.
 */
export class Navigation extends Context.Service<
  Navigation,
  {
    readonly push: (to: AnyRoute, options?: MoveOptions) => Effect.Effect<void>;
    readonly replace: (
      to: AnyRoute,
      options?: MoveOptions,
    ) => Effect.Effect<void>;
    readonly back: Effect.Effect<void>;
    readonly forward: Effect.Effect<void>;
    /** Back, if the entry before is `route`; else replace this entry with it. */
    readonly backTo: (to: AnyRoute) => Effect.Effect<void>;
    /**
     * Load every place on screen again, its data shown meanwhile, and drop
     * every other copy the Data cache keeps; `{ anew: true }` drops the data
     * shown too, and loads it as a move does. `{ anew: true, hold: true }`
     * holds it until the new data comes, and ends once that lands.
     */
    readonly reload: (options?: ReloadOptions) => Effect.Effect<void>;
    /** Warm the Data cache, and the code of the lazy Views, for a Route the app may move to. */
    readonly preload: (to: AnyRoute) => Effect.Effect<void>;
  }
>()('@kestack/kabuki/routing/Navigation') {}

const Route = Schema.Struct({ _tag: Schema.String });
const args = Schema.Struct({ route: Route });
const moving = Schema.Struct({ route: Route, ...moveOptions });

const pushing = Command.make('push', {
  args: moving,
  run: ({ route, ...options }) =>
    Navigation.use((navigation) => navigation.push(route, options)),
});
const replacing = Command.make('replace', {
  args: moving,
  run: ({ route, ...options }) =>
    Navigation.use((navigation) => navigation.replace(route, options)),
});
const backing = Command.make('back', {
  run: () => Navigation.use((navigation) => navigation.back),
});
const forwarding = Command.make('forward', {
  run: () => Navigation.use((navigation) => navigation.forward),
});
const backingTo = Command.make('back to', {
  args,
  run: ({ route }) => Navigation.use((navigation) => navigation.backTo(route)),
});
const reloading = Command.make('reload', {
  args: Schema.Struct(reloadOptions),
  run: (options) => Navigation.use((navigation) => navigation.reload(options)),
});
const preloading = Command.make('preload', {
  args,
  run: ({ route }) => Navigation.use((navigation) => navigation.preload(route)),
});

/** Move to a Route, as a new entry: `{ resetScroll: false }` leaves the page scrolled as it is, `{ hash }` goes to an element on it. */
export const push = (to: AnyRoute, options: MoveOptions = {}) =>
  pushing({ route: to, ...options });
/** Put a Route in place of this entry: Back skips what was here. */
export const replace = (to: AnyRoute, options: MoveOptions = {}) =>
  replacing({ route: to, ...options });
/** The browser's Back, or the memory history's. */
export const back = () => backing();
export const forward = () => forwarding();
/** Close something with a Route of its own, like a dialog: Back if the app came from `route`, else replace this entry with it. */
export const backTo = (to: AnyRoute) => backingTo({ route: to });
/**
 * Load every place on screen again, as after a save: the data shown stays
 * until the new data comes. `{ anew: true }`, when what the data belongs to
 * changed, as the signed-in account: the data shown goes, as on a move.
 * `{ anew: true, hold: true }` keeps it shown until the new data comes, and
 * the Command ends once that lands: the Update that asked shows the wait.
 */
export const reload = (options: ReloadOptions = {}) => reloading(options);
/** Warm the Data cache for a Route the app may move to next. */
export const preload = (to: AnyRoute) => preloading({ route: to });
