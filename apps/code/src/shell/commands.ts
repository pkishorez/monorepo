import { Effect, Queue, Schema } from 'effect';
import { Ai } from '@kestack/ai-toolkit/client';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Command } from '@kestack/kabuki';
import { Store } from '@kestack/std-toolkit/replica';
import {
  Ask,
  DeviceState,
  Dictations,
  SavedMachines,
} from '../layer/capabilities/index.ts';

/*
 * The root page's errands: signing in, what signing out of this device
 * deletes, handing an ask on to the Dictation, and keeping Vim Mode.
 */

export const signIn = Command.make('SignIn', {
  run: () =>
    Effect.flatMap(Accounts, (accounts) => accounts.signIn()).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'SignInFailed' as const,
          problem: error.message,
        }),
      ),
    ),
});

/** Deletes a Machine's records on this device: best effort. */
const removeRecords = (machineId: string) =>
  Effect.flatMap(Store, (store) => Effect.ignore(store.remove(Ai, machineId)));

/**
 * Signing an Account out of this device deletes the records of every
 * Machine it was last given here, and empties that list: best effort.
 */
export const signedOut = Command.make('MachinesSignedOut', {
  args: Schema.Struct({ accountIds: Schema.Array(Schema.String) }),
  run: ({ accountIds }) =>
    Effect.flatMap(SavedMachines, (saved) =>
      Effect.forEach(
        accountIds,
        (accountId) =>
          saved.read(accountId).pipe(
            Effect.flatMap((machines) =>
              Effect.forEach(machines ?? [], ({ id }) => removeRecords(id), {
                discard: true,
              }),
            ),
            Effect.andThen(saved.write(accountId, [])),
          ),
        { discard: true },
      ),
    ),
});

/** Hands an ask to the Dictation. */
export const askDictation = Command.make('AskDictation', {
  args: Ask,
  run: (ask) =>
    Effect.flatMap(Dictations, ({ asked }) =>
      Effect.asVoid(Queue.offer(asked, ask)),
    ),
});

/** Keeps Vim Mode on or off in Device State; a write that fails is lost. */
export const setVim = Command.make('SetVim', {
  args: Schema.Struct({ on: Schema.Boolean }),
  run: ({ on }) =>
    Effect.flatMap(DeviceState, (store) => store.setVim(on)).pipe(
      Effect.ignore,
    ),
});
