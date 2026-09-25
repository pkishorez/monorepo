import { LoginScreen, type Branding } from 'kui-toolkit/components/blocks/auth';
import { useMemo } from 'react';

import { createAuthorizationClient, pageQuery } from '../../client/index.js';
import {
  ADD_ACCOUNT,
  returnDestination,
  useScreenRoute,
} from '../../screen-routing/index.js';
import {
  useSignedInAccounts,
  type MultiSessionOptions,
} from '../../signed-in-accounts/index.js';

interface LoginPageProps {
  branding: Branding;
  multiSession: MultiSessionOptions | undefined;
}

export function LoginPage({ branding, multiSession }: LoginPageProps) {
  const client = useMemo(createAuthorizationClient, []);
  const session = client.useSession();
  const show = useScreenRoute('login', session);
  const accounts = useSignedInAccounts(client, session.data, multiSession);
  const query = useMemo(pageQuery, []);
  const continuing = query.has('client_id');
  const adding = query.has(ADD_ACCOUNT) && session.data !== null;
  const error = query.get('error_description') ?? undefined;

  const signIn = () =>
    client.signIn.social({
      provider: 'google',
      callbackURL: continuing
        ? undefined
        : new URL(
            returnDestination(window.location.search),
            window.location.href,
          ).href,
    });

  return (
    <LoginScreen
      branding={branding}
      state={
        show
          ? { status: 'ready', continuing, adding, error }
          : { status: 'loading' }
      }
      accounts={accounts}
      onSignIn={signIn}
    />
  );
}
