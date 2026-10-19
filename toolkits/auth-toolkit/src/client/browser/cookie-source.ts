import { Effect, Schema } from 'effect';
import type {
  AccountsError,
  AccountsState,
  SignInOptions,
} from '../accounts/index.js';
import {
  signedOut,
  type Snapshot,
  SnapshotSchema,
} from '../accounts-layer/index.js';
import { authWorker } from '../auth-worker/index.js';

const Active = Schema.Struct({ active: Schema.NullOr(Schema.String) });

/** Where the Login Screen is, coming back to `returnTo`. */
export const loginUrl = (
  url: string,
  returnTo: string,
  addAccount: boolean,
): string => {
  const login = new URL('/login', url);
  login.searchParams.set('return_to', returnTo);
  if (addAccount) login.searchParams.set('add_account', '1');
  return login.toString();
};

/** The Accounts the Auth Worker keeps for this browser's cookie (a Direct
 * Sign-in Check): listed without tokens, each action answered by listing
 * them again. */
export const makeCookieSource = (url: string) =>
  Effect.map(authWorker(url, { credentials: 'include' }), (worker) => {
    const read: Effect.Effect<Snapshot, AccountsError> = worker.get(
      '/accounts',
      SnapshotSchema,
    );
    const then = <E>(action: Effect.Effect<unknown, E>) =>
      Effect.andThen(action, read);

    return {
      read,
      signIn: (options: SignInOptions, state: AccountsState) =>
        Effect.sync(() =>
          window.location.assign(
            loginUrl(
              url,
              options.returnTo ?? window.location.href,
              state._tag === 'SignedIn',
            ),
          ),
        ).pipe(
          // The page is leaving for the Login Screen.
          Effect.andThen(Effect.never),
        ),
      switchTo: (userId: string) =>
        then(worker.post('/accounts/switch', { userId }, Active)),
      signOut: (userId: string) =>
        then(worker.post('/accounts/sign-out', { userId }, Active)),
      signOutAll: worker
        .post('/sign-out', {}, Schema.Unknown)
        .pipe(Effect.as(signedOut)),
    };
  });
