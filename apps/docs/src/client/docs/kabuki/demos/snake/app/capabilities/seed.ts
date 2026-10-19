import { Context } from 'effect';

/** What the app's Layer gives for luck: the seed food is placed by. */
export class Seed extends Context.Service<Seed, { readonly seed: string }>()(
  'Seed',
) {}
