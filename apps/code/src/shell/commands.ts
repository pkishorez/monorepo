import { Effect, Queue, Schema } from 'effect';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Command } from '@kestack/kabuki';
import {
  AccountReplicas,
  Ask,
  DeviceState,
  Dictations,
  SavedMachines,
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
 * Which Accounts' records this device keeps: an Account signed out of it
 * takes its records and its list of Machines with it, and once Accounts
 * are signed in, `signedIn`, only theirs are kept. Best effort.
 */
export const keepAccounts = Command.make('KeepAccounts', {
  args: Schema.Struct({
    signedIn: Schema.NullOr(Schema.Array(Schema.String)),
    signedOut: Schema.Array(Schema.String),
  }),
  run: ({ signedIn, signedOut }) =>
    Effect.gen(function* () {
      const saved = yield* SavedMachines;
      const replicas = yield* AccountReplicas;
      yield* Effect.forEach(signedOut, (id) => saved.write(id, []), {
        discard: true,
      });
      yield* replicas.dropAccounts(signedOut);
      if (signedIn !== null) yield* replicas.keepAccounts(signedIn);
    }),
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
