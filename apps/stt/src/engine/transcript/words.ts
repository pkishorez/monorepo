import { Schema } from 'effect';

/** One spoken word with its bounds on the audio clock, in seconds. */
export const Word = Schema.Struct({
  text: Schema.String,
  start: Schema.Number,
  end: Schema.Number,
});
export type Word = typeof Word.Type;

/** A word the session will never revise. */
export interface FinalWord extends Word {
  readonly final: true;
}

/** A word the speech model may still replace on its next pass. */
export interface ProvisionalWord extends Word {
  readonly final: false;
}

export type TimedWord = FinalWord | ProvisionalWord;
