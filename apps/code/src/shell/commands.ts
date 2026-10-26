import { Effect, Queue, Schema } from 'effect';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Command } from '@kestack/kabuki';
import {
  Ask,
  DeviceState,
  Dictations,
  dropEverywhere,
} from '../layer/capabilities/index.ts';

/*
 * The root page's errands: signing in, which Accounts' records this
 * device keeps, handing an ask on to the Dictation, and keeping Vim Mode.
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

/**
 * Keeps the records, kept copies, Saved Drafts and Unseen marks of the
 * Accounts signed in on this device and deletes every other's. Best effort.
 */
export const keepAccounts = Command.make('KeepAccounts', {
  args: Schema.Struct({ accountIds: Schema.Array(Schema.String) }),
  run: ({ accountIds }) =>
    dropEverywhere({ _tag: 'SignedOut', signedIn: accountIds }),
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
