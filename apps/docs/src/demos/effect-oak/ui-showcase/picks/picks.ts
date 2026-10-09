import { Context, Effect } from 'effect';

/*
 * How a component tells its parent what was picked: a Request. Every
 * component here owns its value (it is uncontrolled), and reports each
 * change up through whoever Provides Picks, so the parent keeps a copy.
 */

/** Whoever takes reports from components: the showcase. */
export class Picks extends Context.Service<
  Picks,
  { readonly report: (source: string, value: string) => void }
>()('docs/ui-showcase/Picks') {}

/** A Command reporting `value` under `source` to whoever Provides Picks. */
export const reportPick = (source: string, value: string) =>
  Effect.gen(function* () {
    (yield* Picks).report(source, value);
  });
