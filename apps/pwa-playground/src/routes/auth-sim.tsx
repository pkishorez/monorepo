import { createFileRoute } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
import { clearRuntimeCache } from 'pwa-toolkit/react';
import { useState } from 'react';
import {
  Actions,
  Panel,
  Readout,
  Readouts,
  ScenarioPage,
} from '../components/index.ts';
import { type Served, servedFetch } from '../lib/served.ts';

export const Route = createFileRoute('/auth-sim')({ component: AuthSim });

const SESSION_URL = '/api/auth/session';

const cachedSessionEntries = async (): Promise<number> => {
  let count = 0;
  for (const name of await caches.keys()) {
    const keys = await (await caches.open(name)).keys();
    count += keys.filter((request) =>
      request.url.includes('/api/auth/'),
    ).length;
  }
  return count;
};

function AuthSim() {
  const [session, setSession] = useState<Served | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [cached, setCached] = useState<number | null>(null);
  const [log, setLog] = useState<ReadonlyArray<string>>([]);
  const note = (line: string) =>
    setLog((lines) =>
      [`${new Date().toLocaleTimeString()} ${line}`, ...lines].slice(0, 8),
    );

  const readSession = async () => {
    const served = await servedFetch(SESSION_URL);
    setSession(served);
    if (served.error === null) {
      setUser((served.body as { user: string | null } | null)?.user ?? null);
    }
    setCached(await cachedSessionEntries());
  };

  const post = async (action: 'sign-in' | 'sign-out') => {
    await fetch(SESSION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (action === 'sign-out') {
      await clearRuntimeCache();
      note('signed out, Runtime Caches cleared');
    } else {
      note('signed in');
    }
    await readSession();
  };

  return (
    <ScenarioPage
      id="auth-sim"
      title="Auth never cached"
      explanation={
        <>
          <p>
            {SESSION_URL} sits under /api/auth/, which the worker never caches
            (neverCache), even though a catch-all /api/ network-first rule would
            match it. Every read reaches the network: the x-served-at stamp is
            always new, and offline it fails instead of answering with a stale
            session. Offline is not signed out.
          </p>
          <p>
            Signing out calls clearRuntimeCache(), so the next user of the
            device gets nothing the previous one cached.
          </p>
        </>
      }
    >
      <Panel title="Session">
        <Readouts>
          <Readout
            label="User"
            testId="auth-user"
            value={user ?? 'signed out'}
          />
          <Readout
            label="Came from"
            testId="auth-source"
            value={
              session === null
                ? 'not fetched'
                : session.error !== null
                  ? `error: ${session.error}`
                  : session.fromCache
                    ? 'cache (bug)'
                    : 'network'
            }
          />
          <Readout
            label="x-served-at"
            testId="auth-served-at"
            value={session?.servedAt || '—'}
          />
          <Readout
            label="Cached /api/auth entries"
            testId="auth-cached-entries"
            value={cached ?? '—'}
          />
        </Readouts>
        <Actions>
          <Button data-testid="auth-read" onClick={() => void readSession()}>
            Read session
          </Button>
          <Button
            variant="outline"
            data-testid="auth-sign-in"
            onClick={() => void post('sign-in')}
          >
            Sign in
          </Button>
          <Button
            variant="destructive"
            data-testid="auth-sign-out"
            onClick={() => void post('sign-out')}
          >
            Sign out
          </Button>
        </Actions>
        <ul
          data-testid="auth-log"
          className="font-mono text-xs text-muted-foreground"
        >
          {log.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Panel>
    </ScenarioPage>
  );
}
