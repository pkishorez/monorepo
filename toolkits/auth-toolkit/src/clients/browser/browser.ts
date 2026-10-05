import { multiSessionClient } from 'better-auth/client/plugins';
import { createAuthClient as createBetterAuthClient } from 'better-auth/react';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

const LOGIN_ERROR_CHANGE_EVENT = 'auth-toolkit:login-error-change';

export interface GoogleSignInOptions {
  /** Defaults to the current page without stale login-error parameters. */
  callbackURL?: string;
  /** Defaults to the current page without stale login-error parameters. */
  errorCallbackURL?: string;
}

export interface LoginError {
  code: string;
  description?: string;
}

export interface LoginErrorState {
  error: LoginError | null;
  dismiss: () => void;
}

/** A User signed in within this browser, as a First-Party app sees them. */
export interface SignedInAccount {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  /** The account's Session token: send it as `Authorization: Bearer` to act
   * as this account whichever one is active. */
  token: string;
  /** Whether this is the Active Account, the one the session cookie names. */
  active: boolean;
}

type Result<T> = Promise<{
  data: T | null;
  error: { message?: string | undefined; status: number } | null;
}>;

/** Typed by hand: Better Auth's inferred plugin types reach into zod
 * internals and break the package's declarations. */
interface MultiSession {
  getSession: () => Result<{ session: { token: string } }>;
  multiSession: {
    listDeviceSessions: () => Result<
      Array<{
        user: SignedInAccount['user'] & { image?: string | null };
        session: { token: string };
      }>
    >;
    setActive: (input: { sessionToken: string }) => Result<unknown>;
    revoke: (input: { sessionToken: string }) => Result<unknown>;
  };
}

const dataOf = async <T>(result: Result<T>): Promise<T | null> => {
  const { data, error } = await result;
  if (error) {
    throw new Error(error.message ?? `Auth Worker answered ${error.status}`);
  }
  return data;
};

interface AuthClientConfig {
  /** The Auth Worker's own deployed URL. */
  baseURL: string;
}

const browserHref = () =>
  typeof window === 'undefined' ? '' : window.location.href;

const patchedHistories = new WeakSet<History>();

// pushState/replaceState fire no event, so SPA routers would change the href
// without notifying subscribers.
const patchHistoryOnce = () => {
  if (patchedHistories.has(window.history)) return;
  patchedHistories.add(window.history);

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = window.history[method];
    window.history[method] = function (
      this: History,
      ...args: Parameters<History[typeof method]>
    ) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event(LOGIN_ERROR_CHANGE_EVENT));
      return result;
    };
  }
};

const subscribeToLocation = (onStoreChange: () => void) => {
  if (typeof window === 'undefined') return () => undefined;

  patchHistoryOnce();
  window.addEventListener('popstate', onStoreChange);
  window.addEventListener(LOGIN_ERROR_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('popstate', onStoreChange);
    window.removeEventListener(LOGIN_ERROR_CHANGE_EVENT, onStoreChange);
  };
};

const withoutLoginError = (href: string) => {
  const url = new URL(href);
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  return url.toString();
};

const currentCallbackURL = () => {
  if (typeof window === 'undefined') {
    throw new Error(
      'signIn.google requires explicit callbackURL and errorCallbackURL outside a browser.',
    );
  }
  return withoutLoginError(window.location.href);
};

const loginErrorFromHref = (href: string): LoginError | null => {
  if (!href) return null;

  const params = new URL(href).searchParams;
  const code = params.get('error');
  if (!code) return null;

  const description = params.get('error_description') || undefined;
  return { code, ...(description ? { description } : {}) };
};

export const createAuthClient = (config: AuthClientConfig) => {
  const client = createBetterAuthClient({
    baseURL: config.baseURL,
    fetchOptions: { credentials: 'include' },
    plugins: [multiSessionClient()],
  });
  const multi = client as unknown as MultiSession;

  return {
    useSession: client.useSession,
    useLoginError: (): LoginErrorState => {
      const href = useSyncExternalStore(
        subscribeToLocation,
        browserHref,
        () => '',
      );
      const error = useMemo(() => loginErrorFromHref(href), [href]);
      const dismiss = useCallback(() => {
        if (typeof window === 'undefined') return;

        const nextURL = withoutLoginError(window.location.href);
        window.history.replaceState(window.history.state, '', nextURL);
      }, []);

      return { error, dismiss };
    },
    signIn: {
      google: (options: GoogleSignInOptions = {}) => {
        const defaultURL =
          options.callbackURL && options.errorCallbackURL
            ? undefined
            : currentCallbackURL();
        return client.signIn.social({
          provider: 'google',
          callbackURL: options.callbackURL ?? defaultURL,
          errorCallbackURL: options.errorCallbackURL ?? defaultURL,
        });
      },
    },
    signOut: () => client.signOut(),
    /** Every Signed-in Account of this browser, the Active Account marked;
     * none when signed out. Throws when the Auth Worker can't be reached. */
    signedInAccounts: async (): Promise<SignedInAccount[]> => {
      const [current, listed] = await Promise.all([
        dataOf(multi.getSession()),
        dataOf(multi.multiSession.listDeviceSessions()),
      ]);
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
    },
    /** Makes a Signed-in Account the Active Account, for the whole browser. */
    switchAccount: async (token: string): Promise<void> => {
      await dataOf(multi.multiSession.setActive({ sessionToken: token }));
    },
    /** Signs out one Signed-in Account and ends its Session; the others stay.
     * Signing out the Active Account makes another one active, if any. */
    signOutAccount: async (token: string): Promise<void> => {
      await dataOf(multi.multiSession.revoke({ sessionToken: token }));
    },
  };
};
