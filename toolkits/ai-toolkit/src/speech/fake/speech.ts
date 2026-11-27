import { Schema, SubscriptionRef } from 'effect';
import { Fake } from '@kestack/kabuki/fake';
import { speechFakeOver } from './layer.js';

/*
 * The Speech fake: what Speech to Text stands on, on a computer (its
 * folder, the model on disk, and the model hearing). Its state starts
 * switched off, nothing on disk. layer.ts runs the real speech model and
 * Takes over it (`../front`), so Code sees what a real computer would say.
 *
 * - Disk      whether it was switched on (`wished`) and the model is on
 *             disk (`installed`), as the speech model writes and deletes
 *             them.
 * - Hearing   what every Take turns into, the one control.
 */

export const SpeechState = Schema.Struct({
  /** Speech to Text was switched on: its wish is kept. */
  wished: Schema.Boolean,
  /** The model's files are on disk. */
  installed: Schema.Boolean,
  /** What a Take turns into; blank for a plain sentence. */
  hearing: Schema.String,
});
export type SpeechState = typeof SpeechState.Type;

/** The Speech fake. Its Layer gives `Speech`. */
export const speech = Fake.make({
  name: 'speech',
  state: SpeechState,
  initial: { wished: false, installed: false, hearing: '' },
  controls: {
    Hear: Fake.control(
      SpeechState,
      Schema.Struct({ text: Schema.String }).annotate({
        description:
          'Every Take, the words of a Dictation, turns into this text from now on; blank for a plain sentence.',
      }),
      ({ text }, state) =>
        SubscriptionRef.update(state, (s) => ({ ...s, hearing: text.trim() })),
    ),
  },
  layer: speechFakeOver,
});
