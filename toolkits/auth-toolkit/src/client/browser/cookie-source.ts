import { Effect, Schema } from 'effect';
import {
  type AccountsError,
  type AccountsState,
  type SignInOptions,
  TestSignInRefused,
} from '../accounts/index.js';
import { TEST_SIGN_IN_PATH } from '../../contract/index.js';
import { signedOut, type Snapshot, SnapshotSchema } from '../engine/index.js';
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

/** The Auth Worker's answer to a Test User sign-in it refused: its own code,
 * or `TEST_USERS_OFF` when it has no such endpoint. */
const testRefusal = ({
  status,
  code,
  reason,
}: {
  readonly status: number;
  readonly code?: string | undefined;
  readonly reason?: string | undefined;
}) =>
  new TestSignInRefused({
    code: code ?? (status === 404 ? 'TEST_USERS_OFF' : `HTTP_${status}`),
    ...(reason ? { reason } : {}),
  });

/** The Accounts the Auth Worker keeps for this browser's cookie (a Direct
 * Sign-in Check): listed without tokens, each action answered by listing
 * them again. A Test User sign-in is one more such action; any other
 * sign-in leaves for the Login Screen. */
export const makeCookieSource = (url: string) =>
  Effect.map(authWorker(url, { credentials: 'include' }), (worker) => {
    const read: Effect.Effect<Snapshot, AccountsError> = worker.get(
      '/accounts',
      SnapshotSchema,
    );
    const then = <E>(action: Effect.Effect<unknown, E>) =>
      Effect.andThen(action, read);

    const signInTest = ({ email, key }: { email: string; key?: string }) =>
      then(
        worker
          .post(
            TEST_SIGN_IN_PATH,
            key === undefined ? { email } : { email, key },
            Schema.Unknown,
          )
          .pipe(
            Effect.catchTag('AuthWorkerRejected', (rejected) =>
              Effect.fail(testRefusal(rejected)),
            ),
          ),
      );

    const leaveForLogin = (options: SignInOptions, state: AccountsState) =>
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
      );

    return {
      read,
      signIn: (options: SignInOptions, state: AccountsState) =>
        options.test ? signInTest(options.test) : leaveForLogin(options, state),
      switchTo: (userId: string) =>
        then(worker.post('/accounts/switch', { userId }, Active)),
      signOut: (userId: string) =>
        then(worker.post('/accounts/sign-out', { userId }, Active)),
      signOutAll: worker
        .post('/sign-out', {}, Schema.Unknown)
        .pipe(Effect.as(signedOut)),
    };
  });
