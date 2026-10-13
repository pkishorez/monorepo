import { Context, Schema } from 'effect';
import type { Effect } from 'effect';
import { Command } from '../../core/index.ts';

/** A Route of any app: what the router moves to. */
export type AnyRoute = { readonly _tag: string };

/**
 * The Capability the router Provides to everything below it: Requests that
 * move the app, each one Message to the router, with who asked. An Actor
 * that moves the app from an Update lists it in its Requires and returns
 * `Router.push(…)` and the like as Commands.
 */
export class Navigation extends Context.Service<
  Navigation,
  {
    readonly push: (route: AnyRoute) => Effect.Effect<void>;
    readonly replace: (route: AnyRoute) => Effect.Effect<void>;
    readonly back: Effect.Effect<void>;
    readonly forward: Effect.Effect<void>;
    /** Back, if the entry before is `route`; else replace this entry with it. */
    readonly backTo: (route: AnyRoute) => Effect.Effect<void>;
  }
>()('@kestack/kabuki/routing/Navigation') {}

const Route = Schema.Struct({ _tag: Schema.String });
const args = Schema.Struct({ route: Route });

const pushing = Command.make('push', {
  args,
  run: ({ route }) => Navigation.use((navigation) => navigation.push(route)),
});
const replacing = Command.make('replace', {
  args,
  run: ({ route }) => Navigation.use((navigation) => navigation.replace(route)),
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

/** Move to a Route, as a new entry. */
export const push = (route: AnyRoute) => pushing({ route });
/** Put a Route in place of this entry: Back skips what was here. */
export const replace = (route: AnyRoute) => replacing({ route });
/** The browser's Back, or the memory history's. */
export const back = () => backing();
export const forward = () => forwarding();
/** Close something with a Route of its own, like a dialog: Back if the app came from `route`, else replace this entry with it. */
export const backTo = (route: AnyRoute) => backingTo({ route });
