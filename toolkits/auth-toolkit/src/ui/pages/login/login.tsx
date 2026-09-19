import { LoginScreen, type Branding } from 'kui-toolkit/components/blocks/auth';
import { useMemo } from 'react';

import { createAuthorizationClient, pageQuery } from '../../client/index.js';
import {
  returnDestination,
  useScreenRoute,
} from '../../screen-routing/index.js';

export function LoginPage({ branding }: { branding: Branding }) {
  const client = useMemo(createAuthorizationClient, []);
  const session = client.useSession();
  const show = useScreenRoute('login', session);
  const query = useMemo(pageQuery, []);
  const continuing = query.has('client_id');
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
        show ? { status: 'ready', continuing, error } : { status: 'loading' }
      }
      onSignIn={signIn}
    />
  );
}
