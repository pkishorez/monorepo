import { Context } from 'effect';
import type { Effect } from 'effect';

/*
 * What the timeline asks of whoever places it: show a Step, or go live;
 * carry on from the Step shown on a new Branch; Travel the app or not.
 */

export class Steps extends Context.Service<
  Steps,
  {
    /** Show the Step right after this entry; `null` goes live. */
    readonly choose: (step: number | null) => Effect.Effect<void>;
    readonly fork: Effect.Effect<void>;
    readonly travel: (travel: boolean) => Effect.Effect<void>;
  }
>()('@kestack/devtools-kabuki/Steps') {}
