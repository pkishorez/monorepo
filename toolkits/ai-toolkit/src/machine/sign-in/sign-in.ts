import { Context, Data, Effect, Layer } from 'effect';
import { Accounts, type AccountsState } from '@kestack/auth-toolkit/client';
import { device } from '@kestack/auth-toolkit/client/device';
import { authInfo } from '../../machines/client/index.js';
import { bearerSigning, localToken, localUser } from './local.js';
import { signInStore } from './sign-in-store.js';

/*
 * How a Machine signs in to its Backend, which says how when asked
 * (`authInfo`): through the Auth Worker it names, as a Device whose one
 * Sign-in is kept in the database file and reused on later runs; or, for a
 * Backend in Local mode, as the User `--as` names, with a Local Token. Either
 * way the result signs every Machines call with a bearer.
 */

/** Signing in could not go ahead as asked. */
export class SignInRefused extends Data.TaggedError('SignInRefused')<{
  readonly message: string;
}> {}

export interface SignInOptions {
  readonly backend: string;
  /** The database file, which keeps the Sign-in. */
  readonly db: string;
  /** Local mode only: the email of the User to act as. */
  readonly as?: string | undefined;
  readonly version: string;
}

const APP = 'ai-toolkit';

const activeOf = (state: AccountsState) =>
  state._tag === 'SignedIn' ? state.active : null;

/** auth-toolkit's Device, signed in to the Auth Worker at `url`. */
const asDevice = (options: SignInOptions, url: string) =>
  Effect.gen(function* () {
    const storage = yield* signInStore(options.db);
    const context = yield* Layer.build(
      device({
        url,
        app: APP,
        version: options.version,
        storage,
        maxAccounts: 1,
      }),
    );
    const accounts = Context.get(context, Accounts);

    /** The signed-in User, signing in first when the stored Sign-in is gone. */
    const ensure = Effect.gen(function* () {
      // An Auth Worker that cannot be asked leaves the stored Sign-in trusted.
      const checked = yield* accounts.check.pipe(
        Effect.catch(() => accounts.current),
      );
      const known = activeOf(checked);
      if (known) return known;
      yield* Effect.log(`Sign in to ${options.backend} through ${url}`);
      yield* accounts.signIn();
      const signed = activeOf(yield* accounts.current);
      if (!signed)
        return yield* new SignInRefused({
          message: 'Signing in did not finish',
        });
      return signed;
    });

    const user = yield* ensure;
    return {
      user,
      signing: Layer.succeedContext(context) as Layer.Layer<unknown>,
      signOut: Effect.ignore(accounts.signOutAll),
      signInAgain: ensure,
    };
  });

/** The User `as` names, signing with a Local Token. */
const asLocal = (as: string) => {
  const user = localUser({ email: as });
  return {
    user,
    signing: bearerSigning(localToken(user)),
    signOut: Effect.void,
    signInAgain: Effect.succeed(user),
  };
};

/**
 * Signs this Machine in to `backend`, as long as the Scope lasts: the User,
 * the Layer that signs every Machines call, signing out (which revokes a
 * Device's Sign-in), and signing in again once a Sign-in was revoked.
 */
export const signIn = (options: SignInOptions) =>
  Effect.gen(function* () {
    const info = yield* authInfo(options.backend);
    if ('url' in info) {
      if (options.as !== undefined)
        return yield* new SignInRefused({
          message: `${options.backend} signs in through ${info.url}; --as is only for a Backend in Local mode.`,
        });
      return yield* asDevice(options, info.url);
    }
    if (options.as === undefined)
      return yield* new SignInRefused({
        message: `${options.backend} is in Local mode: say who to act as with --as <email>.`,
      });
    return asLocal(options.as);
  });

/** Signs this Machine out of `backend`, revoking a Device's Sign-in; nothing in Local mode. */
export const signOut = (options: Omit<SignInOptions, 'as'>) =>
  Effect.scoped(
    Effect.gen(function* () {
      const info = yield* authInfo(options.backend);
      if (!('url' in info)) return;
      const storage = yield* signInStore(options.db);
      const context = yield* Layer.build(
        device({
          url: info.url,
          app: APP,
          version: options.version,
          storage,
          maxAccounts: 1,
        }),
      );
      yield* Effect.ignore(Context.get(context, Accounts).signOutAll);
    }),
  );
