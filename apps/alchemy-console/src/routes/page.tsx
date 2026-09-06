import { createFileRoute } from '@tanstack/react-router';
import { Effect, Exit } from 'effect';
import { useState } from 'react';
import { Button } from 'kui-toolkit/components/ui/button';
import { useComponentLifecycle } from 'use-effect-ts';
import { Rpc } from '../client/rpc/index.ts';
import { authClient } from '../client/auth/index.ts';
import { RpcProvider, useRpc } from './internal/rpc-provider';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  const session = authClient.useSession();
  const loginError = authClient.useLoginError();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authenticate = async (action: 'login' | 'logout') => {
    setBusy(true);
    setError(null);
    loginError.dismiss();

    try {
      const result = await (action === 'login'
        ? authClient.signIn.google()
        : authClient.signOut());
      if (result.error) {
        setError(
          result.error.message ?? 'Authentication failed. Please try again.',
        );
      }
    } catch {
      setError('Could not reach the auth service. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-semibold tracking-tight">Alchemy Console</h1>
      {session.isPending ? (
        <p className="mt-3 text-muted-foreground" role="status">
          Checking session…
        </p>
      ) : session.error ? (
        <>
          <p className="mt-3" role="alert">
            Could not check your session. Please try again.
          </p>
          <Button
            className="mt-6 self-start"
            onClick={() => void session.refetch()}
          >
            Retry
          </Button>
        </>
      ) : session.data ? (
        <>
          <RpcProvider key={session.data.session.id}>
            <Greeting />
          </RpcProvider>
          <Button
            className="mt-3 self-start"
            disabled={busy}
            onClick={() => void authenticate('logout')}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </Button>
        </>
      ) : (
        <>
          <p className="mt-3 text-muted-foreground">
            Sign in to load your greeting.
          </p>
          <Button
            className="mt-6 self-start"
            disabled={busy}
            onClick={() => void authenticate('login')}
          >
            {busy ? 'Signing in…' : 'Login with Google'}
          </Button>
        </>
      )}
      {(error || loginError.error) && (
        <p className="mt-3" role="alert">
          {error ??
            loginError.error?.description ??
            `Login failed: ${loginError.error?.code}`}
        </p>
      )}
    </main>
  );
}

function Greeting() {
  const connection = useRpc();
  const [greeting, setGreeting] = useState('Connecting…');
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(true);

  useComponentLifecycle(
    Effect.gen(function* () {
      if (connection.status !== 'ready') return;
      yield* Effect.sync(() => {
        setPending(true);
        setGreeting('Connecting…');
      });

      const context = yield* connection.runtime.contextEffect;
      const exit = yield* Effect.gen(function* () {
        const rpc = yield* Rpc;
        return yield* rpc.Hello();
      }).pipe(
        Effect.provide(context),
        Effect.timeout('10 seconds'),
        Effect.exit,
      );

      yield* Effect.sync(() => {
        setGreeting(
          Exit.isSuccess(exit)
            ? exit.value
            : 'Could not connect. Please try again.',
        );
        setPending(false);
      });
    }),
    { deps: [connection, attempt] },
  );

  return (
    <>
      <p
        className="mt-3 text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {connection.status === 'error'
          ? 'Could not connect. Reload to try again.'
          : greeting}
      </p>
      <Button
        type="button"
        className="mt-6 self-start"
        disabled={connection.status !== 'ready' || pending}
        onClick={() => setAttempt((value) => value + 1)}
      >
        Refresh
      </Button>
    </>
  );
}
