import { Context } from 'effect';
import type { Effect } from 'effect';
import type { Step } from '../../../../api/index.ts';

/*
 * What the Trail asks of whoever places it: zoom back out to the whole
 * tree, at a moment picked, its Instance's card open unless it stopped
 * there, or as it was.
 */

export class Zoom extends Context.Service<
  Zoom,
  {
    /** Show the Step a moment is at on the whole tree, an Instance's card open, if one is given. */
    readonly land: (id: string | null, step: Step) => Effect.Effect<void>;
    /** Back to the whole tree, at the Step it showed. */
    readonly out: Effect.Effect<void>;
  }
>()('@kestack/devtools-kabuki/Zoom') {}
