import { Context, Schema } from 'effect';
import type { Effect } from 'effect';
import { Command } from '../../core/index.ts';

/** A Route of any app: what the router moves to. */
export type AnyRoute = { readonly _tag: string };

/**
 * Where a move goes: a Route, or a function that makes one, called as the
 * move is asked for. A page's Update or Worker hands a function,
 * `Router.push(() => Routes.Blog())`: the Routes' type is worked out from
 * the pages, so a page must not need it to be typed. Its return is `any`
 * for that reason alone; what the function does is still checked.
 */
// oxlint-disable-next-line typescript/no-explicit-any -- a function's return typed `any` is never worked out while the page is typed.
export type To = AnyRoute | (() => any);

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

/** The Route `to` names. */
export const routeOf = (to: To): AnyRoute =>
  typeof to === 'function' ? (to() as AnyRoute) : to;

/**
 * The Capability the router Provides to everything below it: Requests that
 * move the app, each one Message to the router, with who asked. An Actor
 * that moves the app from an Update lists it in its Requires and returns
 * `Router.push(…)` and the like as Commands.
 */
export class Navigation extends Context.Service<
  Navigation,
  {
    readonly push: (to: To, options?: MoveOptions) => Effect.Effect<void>;
    readonly replace: (to: To, options?: MoveOptions) => Effect.Effect<void>;
    readonly back: Effect.Effect<void>;
    readonly forward: Effect.Effect<void>;
    /** Back, if the entry before is `route`; else replace this entry with it. */
    readonly backTo: (to: To) => Effect.Effect<void>;
    /** Load every place on screen again, its data shown meanwhile, and drop every other copy the Data cache keeps. */
    readonly reload: Effect.Effect<void>;
    /** Warm the Data cache, and the code of the lazy Views, for a Route the app may move to. */
    readonly preload: (to: To) => Effect.Effect<void>;
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
  run: () => Navigation.use((navigation) => navigation.reload),
});
const preloading = Command.make('preload', {
  args,
  run: ({ route }) => Navigation.use((navigation) => navigation.preload(route)),
});

/** Move to a Route, as a new entry: `{ resetScroll: false }` leaves the page scrolled as it is, `{ hash }` goes to an element on it. */
export const push = (to: To, options: MoveOptions = {}) =>
  pushing({ route: routeOf(to), ...options });
/** Put a Route in place of this entry: Back skips what was here. */
export const replace = (to: To, options: MoveOptions = {}) =>
  replacing({ route: routeOf(to), ...options });
/** The browser's Back, or the memory history's. */
export const back = () => backing();
export const forward = () => forwarding();
/** Close something with a Route of its own, like a dialog: Back if the app came from `route`, else replace this entry with it. */
export const backTo = (to: To) => backingTo({ route: routeOf(to) });
/** Load every place on screen again, as after a save: the data shown stays until the new data comes. */
export const reload = () => reloading();
/** Warm the Data cache for a Route the app may move to next. */
export const preload = (to: To) => preloading({ route: routeOf(to) });
