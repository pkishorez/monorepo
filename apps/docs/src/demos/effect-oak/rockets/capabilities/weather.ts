import { Context, Effect } from 'effect';

/** The sky over the launch site, as the site sees it right now. */
export class Weather extends Context.Service<
  Weather,
  { readonly sky: Effect.Effect<'clear' | 'storm'> }
>()('docs/rockets/Weather') {}
