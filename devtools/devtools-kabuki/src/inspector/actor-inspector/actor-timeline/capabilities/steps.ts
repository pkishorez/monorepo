import { Context } from 'effect';
import type { Effect } from 'effect';

/*
 * What the timeline asks of whoever places it: show a Step on the Branch
 * in view, or the Head; show one that follows the Step shown on another
 * Branch, bringing that Branch into view; Fork the app to the Step shown;
 * Travel the app or not.
 */

export class Steps extends Context.Service<
  Steps,
  {
    /** Show the Step right after this entry, or the History's start; `null` the Head. */
    readonly choose: (step: number | 'start' | null) => Effect.Effect<void>;
    /** Show the Step right after this entry, its Branch brought into view. */
    readonly branch: (id: number) => Effect.Effect<void>;
    readonly fork: Effect.Effect<void>;
    readonly travel: (travel: boolean) => Effect.Effect<void>;
  }
>()('@kestack/devtools-kabuki/Steps') {}
