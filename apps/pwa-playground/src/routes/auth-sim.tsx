import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { UserIcon } from '@kstackz/ui-toolkit/lucide';
import { clearRuntimeCache } from '@kstackz/pwa-toolkit/react';
import { useState } from 'react';
import {
  Actions,
  Checklist,
  Code,
  Controls,
  Notice,
  OutcomeChip,
  Page,
  Playground,
  Stage,
  Value,
  Values,
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

const CODE = `// vite.config.ts
pwa({
  // Checked before every rule: these paths always go to the network.
  neverCache: ['/api/auth/'], // the default
  strategies: [
    // Would match /api/auth/session too, if neverCache didn't come first.
    { match: { origin: 'same-origin', pathPrefix: '/api/' },
      strategy: 'network-first', cacheName: 'api' },
  ],
});

// On sign-out, forget everything the last user loaded.
import { clearRuntimeCache } from '@kstackz/pwa-toolkit/react';
await signOut();
await clearRuntimeCache();`;

function AuthSim() {
  const [session, setSession] = useState<Served | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [cached, setCached] = useState<number | null>(null);
  const [log, setLog] = useState<ReadonlyArray<string>>([]);
  const [busy, setBusy] = useState(false);
  const note = (line: string) =>
    setLog((lines) =>
      [`${new Date().toLocaleTimeString()}  ${line}`, ...lines].slice(0, 4),
    );

  const readSession = async () => {
    setBusy(true);
    const served = await servedFetch(SESSION_URL).finally(() => setBusy(false));
    setSession(served);
    if (served.error === null) {
      setUser((served.body as { user: string | null } | null)?.user ?? null);
    }
    setCached(await cachedSessionEntries());
    note(
      served.error === null
        ? 'read the session from the network'
        : `read failed: ${served.error}`,
    );
  };

  const post = async (action: 'sign-in' | 'sign-out') => {
    await fetch(SESSION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (action === 'sign-out') {
      await clearRuntimeCache();
      note('signed out, every runtime cache cleared');
    } else {
      note('signed in');
    }
    await readSession();
  };

  const bug = session !== null && (session.fromCache || (cached ?? 0) > 0);
  const verdict = busy
    ? { outcome: 'running' as const, label: 'Reading' }
    : session === null
      ? { outcome: 'idle' as const, label: 'Not read yet' }
      : session.error !== null
        ? { outcome: 'failure' as const, label: 'Network failed' }
        : bug
          ? { outcome: 'failure' as const, label: 'Cached (bug)' }
          : { outcome: 'success' as const, label: 'Never cached' };

  return (
    <Page
      path="/auth-sim"
      testId="scenario-auth-sim"
      lede={
        <p>
          Some answers must never be saved on the device. The worker sends the
          session endpoint straight to the network, every time, and signing out
          wipes whatever else the last person loaded.
        </p>
      }
    >
      <Playground>
        <Stage className="gap-6">
          <div className="flex w-full max-w-sm items-center gap-4 rounded-2xl bg-background p-4 shadow-sm ring-1 ring-edge">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted">
              <UserIcon
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-xs text-muted-foreground">Session</span>
              <span data-testid="auth-user" className="truncate font-medium">
                {user ?? 'signed out'}
              </span>
            </div>
            <OutcomeChip
              outcome={verdict.outcome}
              label={verdict.label}
              testId="auth-outcome"
            />
          </div>
          <ol
            data-testid="auth-log"
            aria-label="Activity, newest first"
            className="flex h-[6.5rem] w-full max-w-sm flex-col gap-1 font-mono text-xs text-muted-foreground"
          >
            {log.length === 0 ? (
              <li className="m-auto">Sign in to start.</li>
            ) : null}
            {log.map((line, i) => (
              <li key={`${line}-${i}`} className="truncate">
                {line}
              </li>
            ))}
          </ol>
        </Stage>
        <Controls>
          <Actions>
            {user === null ? (
              <Button
                data-testid="auth-sign-in"
                onClick={() => void post('sign-in')}
              >
                Sign in
              </Button>
            ) : (
              <Button
                variant="outline"
                data-testid="auth-sign-out"
                onClick={() => void post('sign-out')}
              >
                Sign out
              </Button>
            )}
            <Button
              variant="ghost"
              data-testid="auth-read"
              onClick={() => void readSession()}
            >
              Read session
            </Button>
          </Actions>
          <p className="text-sm text-pretty text-muted-foreground">
            Read it offline: it fails instead of answering with an old session.
          </p>
        </Controls>
        <Values>
          <Value label="Came from" testId="auth-source">
            {session === null
              ? 'not read'
              : session.error !== null
                ? 'error'
                : session.fromCache
                  ? 'cache (bug)'
                  : 'network'}
          </Value>
          <Value label="Served at" testId="auth-served-at">
            {session?.servedAt.slice(11, 23) || '—'}
          </Value>
          <Value label="Saved copies" testId="auth-cached-entries">
            {cached ?? '—'}
          </Value>
        </Values>
      </Playground>
      <Code title="vite.config.ts" code={CODE} />
      <Notice
        items={[
          <>
            <code>neverCache</code> is checked before every strategy, so a
            catch-all rule for <code>/api/</code> can’t save a session by
            accident.
          </>,
          'Offline is not signed out. The read fails and the app decides what to show; it never sees a stale session.',
          'Signing out clears every runtime cache, so the next person on this device gets nothing the last one loaded.',
        ]}
      />
      <Checklist
        steps={[
          'Sign in, then read the session twice: Served at is new every time and Came from reads network.',
          'Saved copies stays 0.',
          'Go offline and read again: it fails rather than returning an old session.',
          'Sign out: every runtime cache is deleted; the precache stays.',
        ]}
      />
    </Page>
  );
}
