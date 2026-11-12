import { Context, Effect, Layer, Queue, Schema } from 'effect';

/*
 * Between Voice, which hears every ask for the Dictation, and the
 * Dictation, which takes them in turn: one queue, `Voice`, which the
 * Account's page Provides.
 */

/**
 * What a Dictation is for: the field that started it, which its text
 * goes to wherever it is stopped. `key` names the field for as long as it
 * lasts, a Session's Draft or one Item of a question, so the text waits
 * for it while it is not drawn; `connectionId` is where it is best
 * transcribed.
 */
export const Owner = Schema.Struct({
  key: Schema.String,
  connectionId: Schema.String,
});
export type Owner = typeof Owner.Type;

/** What the app asks of the Dictation, through Voice. */
export const Ask = Schema.TaggedUnion({
  /** Start one for `owner`, or stop the one recording, whoever it is for. */
  Toggle: { owner: Schema.NullOr(Owner) },
  /** Throw away the one starting, recording or being written out: nothing goes in. */
  Cancel: {},
  /** Transcribe the failed one again. */
  Retry: { id: Schema.Finite },
  /** Its field put the text in. */
  Took: { id: Schema.Finite },
});

/** The asks the Dictation has not yet taken. */
export class Voice extends Context.Service<
  Voice,
  { readonly asked: Queue.Queue<typeof Ask.Type> }
>()('code/Voice') {}

/** The Dictation's asks, in one queue for the Account. */
export const voice: Layer.Layer<Voice> = Layer.effect(
  Voice,
  Effect.map(Queue.unbounded<typeof Ask.Type>(), (asked) => ({ asked })),
);

/** What `voice` builds, for the Account's page that Provides it. */
export const capabilities: readonly [typeof Voice] = [Voice];
