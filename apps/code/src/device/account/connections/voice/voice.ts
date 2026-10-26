import { Context, Effect, Layer, Queue, Schema } from 'effect';

/*
 * Between Voice, which hears every ask for the Dictation, and the
 * Dictation, which takes them in turn: one queue, which the root page
 * Provides.
 */

/** What the app asks of the Dictation, through Voice. */
export const Ask = Schema.TaggedUnion({
  /** Start one, or stop the one recording. */
  Toggle: {},
  /** Throw away the one starting or recording: nothing is transcribed. */
  Cancel: {},
  /** Transcribe the failed one again. */
  Retry: { id: Schema.Finite },
  /** Its Draft put the text in. */
  Took: { id: Schema.Finite },
  /** A Draft is drawn: text goes to it, the last one drawn first. */
  Register: { key: Schema.String, connectionId: Schema.String },
  /** That Draft is gone: what was coming to it is kept in the list. */
  Unregister: { key: Schema.String },
  /** A text kept in the list goes to the Draft drawn now. */
  Paste: { id: Schema.Finite },
  /** A text kept in the list is thrown away. */
  Discard: { id: Schema.Finite },
});

/** The asks the Dictation has not yet taken. */
export class Dictations extends Context.Service<
  Dictations,
  { readonly asked: Queue.Queue<typeof Ask.Type> }
>()('code/Dictations') {}

/** The Dictation's asks, in one queue for the app. */
export const dictations: Layer.Layer<Dictations> = Layer.effect(
  Dictations,
  Effect.map(Queue.unbounded<typeof Ask.Type>(), (asked) => ({ asked })),
);
