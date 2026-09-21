import { useQuery } from '@tanstack/react-query';
import {
  ConsentScreen,
  type Branding,
  type ConsentState,
  type ScopeDescriptions,
} from 'kui-toolkit/components/blocks/auth';
import { useMemo } from 'react';

import {
  createAuthorizationClient,
  navigate,
  pageQuery,
  unwrap,
  type AuthorizationClient,
} from '../../client/index.js';
import { useScreenRoute } from '../../screen-routing/index.js';
import {
  useSignedInAccounts,
  type MultiSessionOptions,
} from '../../signed-in-accounts/index.js';

interface ConsentPageProps {
  branding: Branding;
  scopes: ScopeDescriptions | undefined;
  multiSession: MultiSessionOptions | undefined;
}

const useClientName = (client: AuthorizationClient, clientId: string) =>
  useQuery({
    queryKey: ['auth-toolkit', 'client-name', clientId],
    enabled: clientId !== '',
    retry: false,
    queryFn: async () => {
      const found = await unwrap(
        client.oauth2.publicClient({ query: { client_id: clientId } }),
        'This app is not registered here.',
      );
      return found?.client_name ?? clientId;
    },
  });

export function ConsentPage({
  branding,
  scopes,
  multiSession,
}: ConsentPageProps) {
  const client = useMemo(createAuthorizationClient, []);
  const session = client.useSession();
  const show = useScreenRoute('consent', session);
  const accounts = useSignedInAccounts(client, session.data, multiSession);
  const query = useMemo(pageQuery, []);
  const clientId = query.get('client_id') ?? '';
  const requested = (query.get('scope') ?? '').split(' ').filter(Boolean);
  const name = useClientName(client, clientId);

  const state: ConsentState = !show
    ? { status: 'loading' }
    : !clientId
      ? {
          status: 'failed',
          reason: 'The request does not say which app is asking.',
        }
      : name.error
        ? { status: 'failed', reason: name.error.message }
        : name.data
          ? { status: 'ready', clientName: name.data, scopes: requested }
          : { status: 'loading' };

  const answer = async (accept: boolean) => {
    const answered = await unwrap(
      client.oauth2.consent({ accept }),
      'Could not record your answer. Try again.',
    );
    if (answered?.url) navigate(answered.url);
  };

  return (
    <ConsentScreen
      branding={branding}
      state={state}
      scopeDescriptions={scopes}
      account={
        session.data
          ? {
              email: session.data.user.email,
              onSignOut: multiSession ? undefined : () => void client.signOut(),
            }
          : undefined
      }
      accounts={accounts}
      onAnswer={answer}
    />
  );
}
