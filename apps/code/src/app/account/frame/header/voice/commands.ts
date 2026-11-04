import { Effect, Queue } from 'effect';
import { Command } from '@kestack/kabuki';
import { Ask, Voice } from './voice.ts';

/*
 * Voice's one errand: handing an ask on to the Dictation.
 */

/** Hands an ask to the Dictation. */
export const askDictation = Command.make('AskDictation', {
  args: Ask,
  run: (ask) =>
    Effect.flatMap(Voice, ({ asked }) =>
      Effect.asVoid(Queue.offer(asked, ask)),
    ),
});
