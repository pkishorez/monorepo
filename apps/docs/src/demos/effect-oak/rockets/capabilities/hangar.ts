import { Context, Effect } from 'effect';

/** The Fleet's hangar: a Rocket asks it to take the Rocket apart. */
export class Hangar extends Context.Service<
  Hangar,
  { readonly dismantle: (name: string) => Effect.Effect<void> }
>()('docs/rockets/Hangar') {}
