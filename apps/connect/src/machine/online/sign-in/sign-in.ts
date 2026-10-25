import { Context, Data, Effect, Layer } from 'effect';
import { Accounts, type AccountsState } from '@kestack/auth-toolkit/client';
import { device } from '@kestack/auth-toolkit/client/device';
import { authInfo } from '../../../cloud/client/index.js';
import { signInStore } from './sign-in-store.js';

/*
 * How a Machine signs in to Cloud Connect, which says how when asked
 * (`authInfo`): through the Auth Worker it names, as a Device whose one
 * Sign-in is kept in the database file and reused on later runs. The
 * result signs every Cloud Connect call with a bearer.
 */

/** Signing in could not go ahead as asked. */
export class SignInRefused extends Data.TaggedError('SignInRefused')<{
  readonly message: string;
}> {}

export interface SignInOptions {
  /** Cloud Connect's base URL. */
  readonly cloud: string;
  /** The database file, which keeps the Sign-in. */
  readonly db: string;
  readonly version: string;
}

const APP = 'ke-connect';

const activeOf = (state: AccountsState) =>
  state._tag === 'SignedIn' ? state.active : null;

/** auth-toolkit's Device for the Auth Worker at `url`, its one Sign-in kept in the database file: its Context, and its Accounts. */
const deviceAt = (
  options: Pick<SignInOptions, 'db' | 'version'>,
  url: string,
) =>
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
    return { context, accounts: Context.get(context, Accounts) };
  });

/** auth-toolkit's Device, signed in to the Auth Worker at `url`. */
const asDevice = (options: SignInOptions, url: string) =>
  Effect.gen(function* () {
    const { context, accounts } = yield* deviceAt(options, url);

    /** A new Sign-in, through the Auth Worker, and its User. */
    const fresh = Effect.gen(function* () {
      yield* Effect.log(`Sign in to ${options.cloud} through ${url}`);
      yield* accounts.signIn();
      const signed = activeOf(yield* accounts.current);
      if (!signed)
        return yield* new SignInRefused({
          message: 'Signing in did not finish',
        });
      return signed;
    });

    /** The signed-in User, signing in first when the stored Sign-in is gone. */
    const ensure = Effect.gen(function* () {
      // An Auth Worker that cannot be asked leaves the stored Sign-in trusted.
      const checked = yield* accounts.check.pipe(
        Effect.catch(() => accounts.current),
      );
      return activeOf(checked) ?? (yield* fresh);
    });

    const user = yield* ensure;
    return {
      user,
      signing: Layer.succeedContext(context) as Layer.Layer<unknown>,
      signOut: Effect.ignore(accounts.signOutAll),
      // Cloud Connect refused the stored Sign-in, whatever the Auth Worker
      // says of it: it goes, and only a new one is trusted.
      signInAgain: Effect.ignore(accounts.signOutAll).pipe(
        Effect.andThen(fresh),
      ),
    };
  });

/**
 * Signs this Machine in to `cloud`, as long as the Scope lasts: the User,
 * the Layer that signs every Cloud Connect call, signing out (which revokes a
 * Device's Sign-in), and signing in again once Cloud Connect refused the
 * Sign-in: always a new one, never the one stored.
 */
export const signIn = (options: SignInOptions) =>
  Effect.gen(function* () {
    const info = yield* authInfo(options.cloud);
    return yield* asDevice(options, info.url);
  });

/**
 * The Sign-in kept for `cloud`, never signing in, as long as the Scope
 * lasts: the Layer that signs Cloud Connect calls with it (null when there
 * is none), and signing out, which revokes the Device's Sign-in.
 */
export const stored = (options: SignInOptions) =>
  Effect.gen(function* () {
    const info = yield* authInfo(options.cloud);
    const { context, accounts } = yield* deviceAt(options, info.url);
    return {
      signing: activeOf(yield* accounts.current)
        ? (Layer.succeedContext(context) as Layer.Layer<unknown>)
        : null,
      signOut: Effect.ignore(accounts.signOutAll),
    };
  });
