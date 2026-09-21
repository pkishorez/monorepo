import {
  HomeScreen,
  type Branding,
  type HomeState,
  type ScopeDescriptions,
} from 'kui-toolkit/components/blocks/auth';
import { useMemo } from 'react';

import { createAuthorizationClient } from '../../client/index.js';
import { useScreenRoute } from '../../screen-routing/index.js';
import {
  useSignedInAccounts,
  type MultiSessionOptions,
} from '../../signed-in-accounts/index.js';
import { useUserAccess } from '../../user-access/index.js';

interface HomePageProps {
  branding: Branding;
  scopes: ScopeDescriptions | undefined;
  multiSession: MultiSessionOptions | undefined;
}

export function HomePage({ branding, scopes, multiSession }: HomePageProps) {
  const client = useMemo(createAuthorizationClient, []);
  const session = client.useSession();
  const show = useScreenRoute('home', session);
  const accounts = useSignedInAccounts(client, session.data, multiSession);
  const access = useUserAccess(client, {
    currentSessionId: session.data?.session.id,
    grants: scopes !== undefined,
  });

  const state: HomeState =
    !show || !session.data || access.status === 'loading'
      ? { status: 'loading' }
      : access.status === 'reauthenticate'
        ? { status: 'reauthenticate' }
        : access.status === 'failed'
          ? { status: 'failed', reason: access.reason }
          : {
              status: 'ready',
              user: session.data.user,
              sessions: access.sessions,
              grants: access.grants,
            };

  const ready = access.status === 'ready' ? access : undefined;
  const nothing = () => Promise.resolve();
  return (
    <HomeScreen
      branding={branding}
      state={state}
      scopeDescriptions={scopes}
      accounts={accounts}
      onSignOut={accounts ? accounts.onSignOut : () => client.signOut()}
      onReauthenticate={() =>
        client.signIn.social({
          provider: 'google',
          callbackURL: window.location.origin,
        })
      }
      onRevokeSession={ready?.revokeSession ?? nothing}
      onRevokeOtherSessions={ready?.revokeOtherSessions ?? nothing}
      onRevokeGrant={ready?.revokeGrant ?? nothing}
      onRetry={access.status === 'failed' ? access.retry : undefined}
    />
  );
}
