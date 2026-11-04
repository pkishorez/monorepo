import { Effect, Schema } from 'effect';
import {
  AccountLimitReached,
  type AccountsError,
  type AccountsState,
  type SignInOptions,
  TestSignInRefused,
} from '../accounts/index.js';
import { TEST_SIGN_IN_PATH } from '../../../contract/index.js';
import { signedOut, type Snapshot, SnapshotSchema } from '../engine/index.js';
import { authWorkerApi } from '../auth-worker-api/index.js';

const Active = Schema.Struct({ active: Schema.NullOr(Schema.String) });

/** better-auth's answer to a social sign-in: where the provider is. */
const Redirect = Schema.Struct({ url: Schema.String });

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
 * them again. A Test User sign-in is one more such action; a sign-in with
 * a `provider` asks the Auth Worker where that provider is, as its Login
 * Screen does, and leaves for it, a failure landing on the Login Screen;
 * any other sign-in leaves for the Login Screen. Each comes back to its
 * own `returnTo`, else `returnTo` here, else the page it left from. Signed
 * in already to `maxAccounts`, no provider sign-in is asked: one more
 * would pass the Auth Worker's limit. */
export const makeCookieSource = (
  url: string,
  returnTo?: string,
  maxAccounts = 5,
) =>
  Effect.map(authWorkerApi(url, { credentials: 'include' }), (worker) => {
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

    const backTo = (options: SignInOptions) =>
      options.returnTo ?? returnTo ?? window.location.href;

    // The page is leaving: the sign-in never completes here.
    const leave = (to: string) =>
      Effect.sync(() => window.location.assign(to)).pipe(
        Effect.andThen(Effect.never),
      );

    const leaveForLogin = (options: SignInOptions, state: AccountsState) =>
      leave(loginUrl(url, backTo(options), state._tag === 'SignedIn'));

    // As the Login Screen's own button does, from the app's page: the
    // cookie goes with it, and an Account added is added beside the rest.
    const leaveFor = (
      provider: 'google',
      options: SignInOptions,
      state: AccountsState,
    ) => {
      const adding = state._tag === 'SignedIn';
      if (adding && state.accounts.length >= maxAccounts)
        return Effect.fail(new AccountLimitReached({ limit: maxAccounts }));
      const back = backTo(options);
      return worker
        .post(
          '/sign-in/social',
          {
            provider,
            callbackURL: back,
            errorCallbackURL: loginUrl(url, back, adding),
          },
          Redirect,
        )
        .pipe(Effect.flatMap(({ url: to }) => leave(to)));
    };

    return {
      read,
      signIn: (options: SignInOptions, state: AccountsState) =>
        options.test
          ? signInTest(options.test)
          : options.provider
            ? leaveFor(options.provider, options, state)
            : leaveForLogin(options, state),
      switchTo: (userId: string) =>
        then(worker.post('/accounts/switch', { userId }, Active)),
      signOut: (userId: string) =>
        then(worker.post('/accounts/sign-out', { userId }, Active)),
      signOutAll: worker
        .post('/sign-out', {}, Schema.Unknown)
        .pipe(Effect.as(signedOut)),
    };
  });
