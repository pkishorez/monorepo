import { Effect, Schema } from 'effect';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Command } from '@kestack/kabuki';
import { Storage } from './storage/index.ts';

/*
 * The root page's errands: signing in, and pruning what this device keeps
 * of Accounts no longer signed in.
 */

/**
 * Signs in with Google at once, coming back to `returnTo`; under the dev
 * Fake, asks for an email.
 */
export const signIn = Command.make('SignIn', {
  args: Schema.Struct({ returnTo: Schema.String }),
  run: ({ returnTo }) =>
    Effect.flatMap(Accounts, (accounts) =>
      accounts.signIn({ provider: 'google', returnTo }),
    ).pipe(
      Effect.as({ _tag: 'SignInEnded' as const }),
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'SignInFailed' as const,
          problem: error.message,
        }),
      ),
    ),
});

/**
 * Deletes what this device keeps of every Account not signed in on it, as
 * the Auth Worker answered: its databases and all under them, its
 * Connections' records, cached copies, Unseen marks and Saved Drafts. Best
 * effort, and run to its end once begun.
 */
export const pruneAccounts = Command.make('PruneAccounts', {
  args: Schema.Struct({ accountIds: Schema.Array(Schema.String) }),
  run: ({ accountIds }) =>
    Effect.flatMap(Storage, (storage) =>
      storage.pruneAccounts(accountIds),
    ).pipe(Effect.uninterruptible),
});
