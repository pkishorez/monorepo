import { Context, Data, Effect, Layer, Scope } from 'effect';
import { Accounts, type AccountsState } from '@kestack/auth-toolkit/client';
import { device } from '@kestack/auth-toolkit/client/device';
import { authInfo } from '../../../cloud/client/index.js';
import { keepAuthInfo, keptAuthInfo } from './auth-file.js';
import { signInStore } from './sign-in-store.js';

/*
 * How a Connection signs in to Cloud Connect, which says how when asked
 * (`authInfo`): through the Auth Worker it names, as a Device whose one
 * Sign-in is kept in the database file and reused on later runs. The
 * result signs every Cloud Connect call with a bearer.
 *
 * What Cloud Connect says is kept beside the Sign-in (auth-file.ts), so a
 * Connection started while Cloud Connect cannot be asked signs in as it
 * last did, with the Sign-in it kept, and starts offline. A first Sign-in
 * still needs Cloud Connect.
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

/** How long Cloud Connect has to say how to sign in before the AuthInfo kept is used. */
const DISCOVERY = '5 seconds';

/** How long the Auth Worker has to check the stored Sign-in before it is trusted as it is. */
const CHECKING = '5 seconds';

/** How `cloud` says to sign in, kept for the next run; as it last said when it cannot be asked. */
const discover = (options: Pick<SignInOptions, 'cloud' | 'db'>) =>
  authInfo(options.cloud).pipe(
    // A Cloud Connect that takes the call and never answers is one that
    // cannot be asked.
    Effect.timeoutOrElse({
      duration: DISCOVERY,
      orElse: () =>
        Effect.fail(
          new Error(
            `${options.cloud} did not say how to sign in in ${DISCOVERY}`,
          ),
        ),
    }),
    Effect.tap((info) => keepAuthInfo(options.db, options.cloud, info)),
    Effect.catch((error) =>
      Effect.flatMap(keptAuthInfo(options.db, options.cloud), (kept) =>
        kept === null
          ? Effect.fail(error)
          : Effect.as(
              Effect.logWarning(
                `${error.message}; signing in as last time, through ${kept.url}`,
              ),
              kept,
            ),
      ),
    ),
  );

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

/**
 * auth-toolkit's Device, signed in to the Auth Worker at `url`. Signing in
 * again asks Cloud Connect how first: an Auth Worker it names anew gets a
 * Device of its own, for the rest of the Scope. Every Device keeps its
 * Sign-in in the same database file, which the Layer that signs reads at
 * each call, so it signs with the newest Sign-in, whichever Device made it.
 */
const asDevice = (options: SignInOptions, url: string) =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const first = yield* deviceAt(options, url);
    let current = { url, accounts: first.accounts };

    /** A new Sign-in, through the current Auth Worker, and its User. */
    const fresh = Effect.gen(function* () {
      const { url, accounts } = current;
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
      // An Auth Worker that cannot be asked, or does not answer in time,
      // leaves the stored Sign-in trusted.
      const checked = yield* first.accounts.check.pipe(
        Effect.timeout(CHECKING),
        Effect.catch(() => first.accounts.current),
      );
      return activeOf(checked) ?? (yield* fresh);
    });

    const user = yield* ensure;
    return {
      user,
      signing: Layer.succeedContext(first.context) as Layer.Layer<unknown>,
      signOut: Effect.suspend(() => Effect.ignore(current.accounts.signOutAll)),
      // Cloud Connect refused the stored Sign-in, whatever the Auth Worker
      // says of it: it goes, and only a new one is trusted, made through
      // the Auth Worker Cloud Connect names now.
      signInAgain: Effect.gen(function* () {
        const info = yield* discover(options);
        yield* Effect.ignore(current.accounts.signOutAll);
        if (info.url !== current.url) {
          const moved = yield* deviceAt(options, info.url).pipe(
            Scope.provide(scope),
          );
          current = { url: info.url, accounts: moved.accounts };
        }
        return yield* fresh;
      }),
    };
  });

/**
 * Signs this Connection in to `cloud`, as long as the Scope lasts: the User,
 * the Layer that signs every Cloud Connect call, signing out (which revokes a
 * Device's Sign-in), and signing in again once Cloud Connect refused the
 * Sign-in: always a new one, never the one stored.
 */
export const signIn = (options: SignInOptions) =>
  Effect.gen(function* () {
    const info = yield* discover(options);
    return yield* asDevice(options, info.url);
  });

/**
 * The Sign-in kept for `cloud`, never signing in, as long as the Scope
 * lasts: the Layer that signs Cloud Connect calls with it (null when there
 * is none), and signing out, which revokes the Device's Sign-in.
 */
export const stored = (options: SignInOptions) =>
  Effect.gen(function* () {
    const info = yield* discover(options);
    const { context, accounts } = yield* deviceAt(options, info.url);
    return {
      signing: activeOf(yield* accounts.current)
        ? (Layer.succeedContext(context) as Layer.Layer<unknown>)
        : null,
      signOut: Effect.ignore(accounts.signOutAll),
    };
  });
