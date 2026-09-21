import { useEffect, useState } from 'react';

import { HomeScreen, type HomeState } from './auth-screens';
import {
  accountsView,
  branding,
  failAfter,
  grants,
  now,
  pause,
  scopeDescriptions,
  sessions,
  user,
} from './fixtures/data';

/** Loads, then revokes for real: rows leave after a short wait. */
function LiveHome({ failing = false }: { failing?: boolean }) {
  const [state, setState] = useState<HomeState>({ status: 'loading' });
  useEffect(() => {
    const timer = setTimeout(
      () => setState({ status: 'ready', user, sessions, grants }),
      1200,
    );
    return () => clearTimeout(timer);
  }, []);

  const update = (
    next: (ready: Extract<HomeState, { status: 'ready' }>) => HomeState,
  ) =>
    setState((current) =>
      current.status === 'ready' ? next(current) : current,
    );

  const revokeSession = async (id: string) => {
    if (failing) return failAfter('Could not revoke that session. Try again.');
    await pause();
    update((ready) => ({
      ...ready,
      sessions: ready.sessions.filter((session) => session.id !== id),
    }));
  };

  return (
    <HomeScreen
      branding={branding}
      state={state}
      now={now}
      scopeDescriptions={scopeDescriptions}
      onSignOut={() => pause(1500)}
      onReauthenticate={() => pause(1500)}
      onRevokeSession={revokeSession}
      onRevokeOtherSessions={async () => {
        await pause();
        update((ready) => ({
          ...ready,
          sessions: ready.sessions.filter((session) => session.current),
        }));
      }}
      onRevokeGrant={async (clientId) => {
        if (failing) return failAfter('Could not revoke that app. Try again.');
        await pause();
        update((ready) => ({
          ...ready,
          grants: ready.grants?.filter((grant) => grant.clientId !== clientId),
        }));
      }}
    />
  );
}

const handlers = {
  onSignOut: () => pause(),
  onReauthenticate: () => pause(),
  onRevokeSession: () => pause(),
  onRevokeOtherSessions: () => pause(),
  onRevokeGrant: () => pause(),
};

export default {
  live: <LiveHome />,
  'live, every revoke fails': <LiveHome failing />,
  loading: (
    <HomeScreen
      branding={branding}
      state={{ status: 'loading' }}
      {...handlers}
    />
  ),

  'could not load': (
    <HomeScreen
      branding={branding}
      state={{
        status: 'failed',
        reason: 'Could not reach the sign-in service. Check your connection.',
      }}
      onRetry={() => undefined}
      {...handlers}
    />
  ),
  'sign in again': (
    <HomeScreen
      branding={branding}
      state={{ status: 'reauthenticate' }}
      {...handlers}
    />
  ),
  'signed in': (
    <HomeScreen
      branding={branding}
      now={now}
      scopeDescriptions={scopeDescriptions}
      state={{ status: 'ready', user, sessions, grants }}
      {...handlers}
    />
  ),
  'only this browser, no apps': (
    <HomeScreen
      branding={branding}
      now={now}
      state={{
        status: 'ready',
        user,
        sessions: sessions.filter((session) => session.current),
        grants: [],
      }}
      {...handlers}
    />
  ),
  'without the Authorization Server Role': (
    <HomeScreen
      branding={branding}
      now={now}
      state={{ status: 'ready', user, sessions }}
      {...handlers}
    />
  ),
  'several Signed-in Accounts': (
    <HomeScreen
      branding={branding}
      now={now}
      scopeDescriptions={scopeDescriptions}
      accounts={accountsView(3)}
      state={{ status: 'ready', user, sessions, grants }}
      {...handlers}
    />
  ),
  'user without a name': (
    <HomeScreen
      branding={branding}
      now={now}
      state={{
        status: 'ready',
        user: { name: '', email: user.email },
        sessions: sessions.filter((session) => session.current),
      }}
      {...handlers}
    />
  ),
};
