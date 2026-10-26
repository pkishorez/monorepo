import { Effect, Queue } from 'effect';
import { Command } from '@kestack/kabuki';
import { Ask, Dictations } from './voice.ts';

/*
 * Voice's one errand: handing an ask on to the Dictation.
 */

/** Hands an ask to the Dictation. */
export const askDictation = Command.make('AskDictation', {
  args: Ask,
  run: (ask) =>
    Effect.flatMap(Dictations, ({ asked }) =>
      Effect.asVoid(Queue.offer(asked, ask)),
    ),
});
