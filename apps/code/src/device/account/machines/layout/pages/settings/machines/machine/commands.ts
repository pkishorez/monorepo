import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { MachineCards } from '../store.ts';

/*
 * What a Machine's card tells Settings → Machines, through `MachineCards`.
 */

/** Asks to forget the Machine `id`. */
export const askForget = Command.make('AskForget', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) => Effect.flatMap(MachineCards, (cards) => cards.forget(id)),
});
