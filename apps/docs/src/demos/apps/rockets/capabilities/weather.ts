import { Context, Effect } from 'effect';

/** The sky over the site, as the Fleet sees it right now. */
export class Weather extends Context.Service<
  Weather,
  { readonly sky: Effect.Effect<'clear' | 'storm'> }
>()('docs/rockets/Weather') {}
