import { Context, Schema } from 'effect';
import type { Queue } from 'effect';

/*
 * Between the root page, which hears every ask for the Dictation, and the
 * Dictation, which takes them in turn. The app Layer gives it, from
 * `services/dictations.ts`.
 */

/** What the app asks of the Dictation, through the root page. */
export const Ask = Schema.TaggedUnion({
  /** Start one, or stop the one recording. */
  Toggle: {},
  /** Transcribe the failed one again. */
  Retry: { id: Schema.Finite },
  /** Its Draft put the text in. */
  Took: { id: Schema.Finite },
});

/** The asks the Dictation has not yet taken. */
export class Dictations extends Context.Service<
  Dictations,
  { readonly asked: Queue.Queue<typeof Ask.Type> }
>()('code/Dictations') {}
