import { Context } from 'effect';
import type { Effect } from 'effect';

/** What the root page offers every page under it: a brief word at the bottom of the page. */
export class Toasts extends Context.Service<
  Toasts,
  {
    /** Says something briefly, at the bottom of the page. */
    readonly show: (text: string) => Effect.Effect<void>;
  }
>()('@kestack/auth-toolkit/pages/Toasts') {}
