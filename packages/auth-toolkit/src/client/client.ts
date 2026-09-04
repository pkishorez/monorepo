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

interface AuthClientConfig {
  /** The Auth Worker's own deployed URL. */
  baseURL: string;
}

const browserHref = () =>
  typeof window === 'undefined' ? '' : window.location.href;

const subscribeToLocation = (onStoreChange: () => void) => {
  if (typeof window === 'undefined') return () => undefined;

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
  });

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
        window.dispatchEvent(new Event(LOGIN_ERROR_CHANGE_EVENT));
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
  };
};
