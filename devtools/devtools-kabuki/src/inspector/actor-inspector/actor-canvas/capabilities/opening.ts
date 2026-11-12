import { Context } from 'effect';
import type { Effect } from 'effect';

/*
 * What the canvas asks of whoever places it: a card opened or closed by
 * the reader, or an Instance zoomed in on, to its Trail. The cards open
 * are its placer's to keep, since a Step looked back at opens one too.
 */

export class Opening extends Context.Service<
  Opening,
  {
    readonly open: (id: string, open: boolean) => Effect.Effect<void>;
    /** Show one Instance's Trail, by its Address, in place of the whole tree. */
    readonly zoom: (id: string) => Effect.Effect<void>;
  }
>()('@kestack/devtools-kabuki/Opening') {}
