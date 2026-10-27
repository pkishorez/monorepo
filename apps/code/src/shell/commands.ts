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
 * The root page's errands: signing in, dropping what this device keeps of
 * Accounts no longer signed in, handing an ask on to the Dictation, and
 * keeping Vim Mode and the sidebar's width.
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
 * Deletes the records, kept copies and Unseen marks of every Account not
 * signed in on this device, and keeps their Saved Drafts, for when one
 * signs in again: the Accounts signed in are a list, and may come short
 * (`Gone`). Best effort.
 */
export const dropSignedOut = Command.make('DropSignedOut', {
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

/** Keeps the sidebar's width in Device State; a write that fails is lost. */
export const setSidebarWidth = Command.make('SetSidebarWidth', {
  args: Schema.Struct({ width: Schema.Finite }),
  run: ({ width }) =>
    Effect.flatMap(DeviceState, (store) => store.setSidebarWidth(width)).pipe(
      Effect.ignore,
    ),
});
