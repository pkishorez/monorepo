import { createAuthClient } from 'better-auth/client';
import { multiSessionClient } from 'better-auth/client/plugins';
import { Effect, Layer } from 'effect';
import {
  Accounts,
  type LoginError,
  type SignedInAccount,
  type SignInOptions,
  Unreachable,
} from './accounts.js';

type Result<T> = Promise<{
  data: T | null;
  error: { message?: string | undefined; status: number } | null;
}>;

/** Typed by hand: Better Auth's inferred plugin types reach into zod
 * internals and break the package's declarations. */
interface Client {
  signIn: {
    social: (input: {
      provider: 'google';
      callbackURL: string;
      errorCallbackURL: string;
    }) => Result<unknown>;
  };
  signOut: () => Result<unknown>;
  getSession: () => Result<{ session: { token: string } }>;
  multiSession: {
    listDeviceSessions: () => Result<
      Array<{
        user: Omit<SignedInAccount['user'], 'image'> & {
          image?: string | null;
        };
        session: { token: string };
      }>
    >;
    setActive: (input: { sessionToken: string }) => Result<unknown>;
    revoke: (input: { sessionToken: string }) => Result<unknown>;
  };
}

const call = <T>(result: () => Result<T>) =>
  Effect.tryPromise({
    try: async () => {
      const { data, error } = await result();
      if (error) {
        throw new Error(
          error.message ?? `Auth Worker answered ${error.status}`,
        );
      }
      return data;
    },
    catch: (cause) =>
      new Unreachable({
        reason: cause instanceof Error ? cause.message : String(cause),
      }),
  });

const withoutLoginError = (href: string) => {
  const url = new URL(href);
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  return url.toString();
};

const loginErrorOf = (href: string): LoginError | null => {
  const params = new URL(href).searchParams;
  const code = params.get('error');
  if (!code) return null;
  const description = params.get('error_description') || undefined;
  return { code, ...(description ? { description } : {}) };
};

interface AccountsLiveConfig {
  /** The Auth Worker's own deployed URL. */
  authWorkerUrl: string;
}

/** Accounts as the Auth Worker keeps them: a Direct Session Check with the
 * browser's cookie, and Google to sign in. */
export const accountsLive = ({ authWorkerUrl }: AccountsLiveConfig) =>
  Layer.sync(Accounts, () => {
    const client = createAuthClient({
      baseURL: authWorkerUrl,
      fetchOptions: { credentials: 'include' },
      plugins: [multiSessionClient()],
    }) as unknown as Client;

    const signIn = (options: SignInOptions = {}) =>
      Effect.gen(function* () {
        const here = withoutLoginError(window.location.href);
        yield* call(() =>
          client.signIn.social({
            provider: 'google',
            callbackURL: options.returnTo ?? here,
            errorCallbackURL: options.errorReturnTo ?? here,
          }),
        );
        // The page is leaving for Google.
        return yield* Effect.never;
      });

    return Accounts.of({
      list: Effect.gen(function* () {
        const [current, listed] = yield* Effect.all(
          [
            call(() => client.getSession()),
            call(() => client.multiSession.listDeviceSessions()),
          ],
          { concurrency: 2 },
        );
        return (listed ?? []).map(({ user, session }) => ({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image ?? null,
          },
          token: session.token,
          active: session.token === current?.session.token,
        }));
      }),
      signIn,
      switchTo: (token) =>
        call(() => client.multiSession.setActive({ sessionToken: token })).pipe(
          Effect.asVoid,
        ),
      signOut: (token) =>
        call(() => client.multiSession.revoke({ sessionToken: token })).pipe(
          Effect.asVoid,
        ),
      signOutAll: call(() => client.signOut()).pipe(Effect.asVoid),
      takeLoginError: Effect.sync(() => {
        const error = loginErrorOf(window.location.href);
        if (error !== null) {
          window.history.replaceState(
            window.history.state,
            '',
            withoutLoginError(window.location.href),
          );
        }
        return error;
      }),
    });
  });
