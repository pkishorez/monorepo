import { Context } from 'effect';
import type { Effect } from 'effect';

/*
 * What the canvas asks of whoever places it: a card opened or closed by
 * the reader. The cards open are its placer's to keep, since a Step looked
 * back at opens one too.
 */

export class Opening extends Context.Service<
  Opening,
  {
    readonly open: (id: string, open: boolean) => Effect.Effect<void>;
  }
>()('@kestack/devtools-kabuki/Opening') {}
