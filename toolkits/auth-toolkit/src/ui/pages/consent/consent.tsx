import { Button } from 'kui-toolkit/components/ui/button';
import { Spinner } from 'kui-toolkit/components/ui/spinner';
import { useEffect, useMemo, useState } from 'react';

import {
  createAuthorizationClient,
  navigate,
  pageQuery,
  type AuthorizationClient,
} from '../../client/index.js';
import { brandName, PageShell, type Branding } from '../../shell/index.js';
import { ScopeList, type ScopeDescriptions } from '../../scope-list/index.js';

interface ConsentPageProps {
  branding: Branding;
  scopes?: ScopeDescriptions;
}

type ClientLookup =
  | { status: 'loading' }
  | { status: 'ready'; name: string }
  | { status: 'failed'; reason: string };

const useClientLookup = (client: AuthorizationClient, clientId: string) => {
  const [state, setState] = useState<ClientLookup>({ status: 'loading' });
  useEffect(() => {
    if (!clientId) {
      setState({
        status: 'failed',
        reason: 'The request does not say which app is asking.',
      });
      return;
    }
    let cancelled = false;
    client.oauth2
      .publicClient({ query: { client_id: clientId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data) {
          setState({ status: 'ready', name: data.client_name ?? clientId });
        } else {
          setState({
            status: 'failed',
            reason:
              error?.error_description ?? 'This app is not registered here.',
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: 'failed',
            reason: 'Could not reach the sign-in service. Try again.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, clientId]);
  return state;
};

export function ConsentPage({ branding, scopes = {} }: ConsentPageProps) {
  const appName = brandName(branding);
  const client = useMemo(createAuthorizationClient, []);
  const { data: session, isPending } = client.useSession();
  const query = useMemo(pageQuery, []);
  const clientId = query.get('client_id') ?? '';
  const requested = (query.get('scope') ?? '').split(' ').filter(Boolean);
  const lookup = useClientLookup(client, clientId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signedInAs = isPending
    ? 'pending'
    : session
      ? { email: session.user.email, signOut: () => client.signOut() }
      : undefined;

  const answer = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    const { data, error: failure } = await client.oauth2.consent({ accept });
    if (data?.url) {
      navigate(data.url);
      return;
    }
    setBusy(false);
    setError(
      failure?.error_description ??
        failure?.message ??
        'Could not record your answer. Try again.',
    );
  };

  if (lookup.status === 'failed') {
    return (
      <PageShell
        branding={branding}
        title="This request can't continue"
        description={lookup.reason}
        signedInAs={signedInAs}
      >
        <p className="text-sm text-muted-foreground">
          Nothing was shared. Return to the app and try again.
        </p>
      </PageShell>
    );
  }

  const name = lookup.status === 'ready' ? lookup.name : null;
  return (
    <PageShell
      loading={lookup.status === 'loading' || isPending}
      branding={branding}
      title={name ? `Allow ${name}?` : 'Allow access?'}
      description={`${name ?? 'An app'} wants to use your ${appName} account. It will be able to:`}
      signedInAs={signedInAs}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            disabled={busy || !name}
            onClick={() => answer(false)}
          >
            Deny
          </Button>
          <Button disabled={busy || !name} onClick={() => answer(true)}>
            {busy ? <Spinner /> : 'Allow'}
          </Button>
        </div>
      }
    >
      <ScopeList requested={requested} descriptions={scopes} />
      <p className="text-xs text-pretty text-muted-foreground">
        Access lasts until you sign out or revoke it. Deny to share nothing.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </PageShell>
  );
}
