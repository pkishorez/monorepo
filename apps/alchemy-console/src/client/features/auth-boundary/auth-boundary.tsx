import { Effect } from 'effect';
import { useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useRunEffect } from 'use-effect-ts';
import { Button } from 'kui-toolkit/components/ui/button';
import { Database } from 'kui-toolkit/lucide';
import { authClient } from '../../connections/auth/index.ts';
import { ThemeToggle } from './theme-toggle.tsx';
import { RpcProvider, useRpc } from '../../session/rpc-session/index.ts';

function AuthButton({ action }: { action: 'login' | 'logout' }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const loginError = authClient.useLoginError();
  const run = useRunEffect(() =>
    Effect.tryPromise(async () => {
      const result = await (action === 'login'
        ? authClient.signIn.google()
        : authClient.signOut());
      return { error: result.error };
    }).pipe(
      Effect.match({
        onSuccess: (result) => {
          if (result.error)
            setError(
              result.error.message ?? 'Could not sign in. Please try again.',
            );
        },
        onFailure: () =>
          setError('Could not reach the auth service. Please try again.'),
      }),
      Effect.ensuring(
        Effect.sync(() => {
          active.current = false;
          setPending(false);
        }),
      ),
    ),
  );
  return (
    <div className="space-y-2">
      <Button
        variant={action === 'login' ? 'default' : 'ghost'}
        disabled={pending}
        onClick={() => {
          if (active.current) return;
          active.current = true;
          setPending(true);
          setError(null);
          loginError.dismiss();
          void run();
        }}
      >
        {pending
          ? action === 'login'
            ? 'Signing in…'
            : 'Signing out…'
          : action === 'login'
            ? 'Continue with Google'
            : 'Sign out'}
      </Button>
      {(error || loginError.error) && (
        <p role="alert" className="max-w-sm text-sm text-destructive">
          {error ??
            loginError.error?.description ??
            'Sign in failed. Please try again.'}
        </p>
      )}
    </div>
  );
}

function ConnectionGate({ children }: { children: ReactNode }) {
  const connection = useRpc();
  if (connection.status === 'connecting')
    return (
      <p className="p-8 text-muted-foreground" role="status">
        Connecting…
      </p>
    );
  if (connection.status === 'error')
    return (
      <div className="space-y-4 p-8">
        <p role="alert">Could not connect.</p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  return children;
}

export function AuthBoundary({
  children,
  HomeLink,
}: {
  children: ReactNode;
  HomeLink: ComponentType<{ className?: string; children: ReactNode }>;
}) {
  const session = authClient.useSession();
  if (session.isPending)
    return (
      <div className="grid min-h-svh place-items-center">
        <p role="status" className="text-sm text-muted-foreground">
          Checking session…
        </p>
      </div>
    );
  if (session.error)
    return (
      <div className="grid min-h-svh place-items-center">
        <div className="space-y-4 text-center">
          <p role="alert">Could not check your session.</p>
          <Button onClick={() => void session.refetch()}>Retry</Button>
        </div>
      </div>
    );
  if (!session.data)
    return (
      <main className="grid min-h-svh place-items-center px-6">
        <div className="absolute right-6 top-6">
          <ThemeToggle />
        </div>
        <section className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
          <Database className="size-8" />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Alchemy Console
            </h1>
            <p className="text-sm text-muted-foreground">
              Your infrastructure, in one place.
            </p>
          </div>
          <AuthButton action="login" />
        </section>
      </main>
    );

  return (
    <RpcProvider key={session.data.session.id}>
      <div className="min-h-svh">
        <header className="border-b bg-card">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <HomeLink className="flex min-w-0 items-center gap-2 font-semibold tracking-tight">
              <Database className="size-5 shrink-0" />
              <span className="truncate">Alchemy Console</span>
            </HomeLink>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <AuthButton action="logout" />
            </div>
          </div>
        </header>
        <ConnectionGate>{children}</ConnectionGate>
      </div>
    </RpcProvider>
  );
}
