import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';
import { Accounts } from '@kestack/auth-toolkit/client';
import { Browser } from '../../shared/pages/index.ts';

/*
 * Console's errands: each asks the Accounts or the Browser once, and ends
 * in one Message. What they change arrives on its own, from the Accounts
 * Console follows.
 */

const done = { _tag: 'ActionDone' as const };
const failed = (error: { readonly message: string }) =>
  Effect.succeed({ _tag: 'ActionFailed' as const, message: error.message });

/** Asks the Auth Worker again who is signed in. */
export const recheck = Command.make('recheck', {
  args: Schema.Struct({}),
  run: () =>
    Effect.gen(function* () {
      yield* (yield* Accounts).check;
      return done;
    }).pipe(
      Effect.catch(() =>
        Effect.succeed({ _tag: 'AccountsUnreachable' as const }),
      ),
    ),
});

/** Signs one more account in: with Google, by leaving for the Login Screen. */
export const signIn = Command.make('signIn', {
  args: Schema.Struct({
    email: Schema.NullOr(Schema.String),
    name: Schema.NullOr(Schema.String),
  }),
  run: ({ email, name }) =>
    Effect.gen(function* () {
      yield* (yield* Browser).signIn(
        email === null ? null : { email, ...(name ? { name } : {}) },
      );
      return done;
    }).pipe(Effect.catch(failed)),
});

export const switchTo = Command.make('switchTo', {
  args: Schema.Struct({ userId: Schema.String }),
  run: ({ userId }) =>
    Effect.gen(function* () {
      yield* (yield* Accounts).switchTo(userId);
      return done;
    }).pipe(Effect.catch(failed)),
});

/** Signs the active account out. */
export const signOut = Command.make('signOut', {
  args: Schema.Struct({}),
  run: () =>
    Effect.gen(function* () {
      yield* (yield* Accounts).signOut();
      return done;
    }).pipe(Effect.catch(failed)),
});
