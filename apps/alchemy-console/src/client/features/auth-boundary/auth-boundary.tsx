import { Effect } from 'effect';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useComponentLifecycle, useRunEffect } from 'use-effect-ts';
import type { LoginError } from '@kstackz/auth-toolkit/clients/auth';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { GoogleButton } from '@kstackz/ui-toolkit/components/ui/google-button';
import { CircleAlert, LoaderCircle } from '@kstackz/ui-toolkit/lucide';
import { LogoMark } from '../brand/index.ts';
import { accounts } from '../../connections/auth/index.ts';
import { appTheme, ThemeToggle } from './theme-toggle.tsx';
import {
  RpcProvider,
  SessionProvider,
  useRpc,
  useSession,
} from '../../session/rpc-session/index.ts';

function useAuthAction(action: 'login' | 'logout') {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<LoginError | null>(null);
  const active = useRef(false);
  const session = useSession();
  useComponentLifecycle(
    action === 'login'
      ? accounts.takeLoginError.pipe(
          Effect.flatMap((taken) => Effect.sync(() => setLoginError(taken))),
        )
      : Effect.void,
  );
  const run = useRunEffect(() =>
    (action === 'login'
      ? accounts.signIn()
      : accounts.signOutAll.pipe(
          Effect.andThen(Effect.promise(session.refresh)),
        )
    ).pipe(
      Effect.catch(() =>
        Effect.sync(() =>
          setError('The sign-in service didn’t respond. Try again.'),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          active.current = false;
          setPending(false);
        }),
      ),
    ),
  );
  const start = () => {
    if (active.current) return;
    active.current = true;
    setPending(true);
    setError(null);
    setLoginError(null);
    void run();
  };
  return {
    pending,
    start,
    error: error ?? loginError?.description ?? null,
  };
}

function LogoutButton() {
  const auth = useAuthAction('logout');
  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={auth.pending}
        aria-busy={auth.pending || undefined}
        onClick={auth.start}
      >
        Sign out
      </Button>
      {auth.error && (
        <p role="alert" className="max-w-sm text-sm text-destructive">
          {auth.error}
        </p>
      )}
    </div>
  );
}

function GoogleSignIn() {
  const auth = useAuthAction('login');
  const { theme } = appTheme.useTheme();
  return (
    <>
      {/* The toolkit button centers itself; a shrink-wrapped parent keeps it on the card's left edge. */}
      <div className="w-fit">
        <GoogleButton
          theme={theme}
          disabled={auth.pending}
          aria-busy={auth.pending || undefined}
          onClick={auth.start}
        />
      </div>
      {auth.error && (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {auth.error}
        </p>
      )}
    </>
  );
}

// One card for every pre-session state so the session check and the sign-in
// prompt never reflow against each other. The action slot is fixed at the
// Google button's height (40px) and only its contents change.
function AuthScreen({
  description,
  action,
}: {
  description: string;
  action: ReactNode;
}) {
  return (
    <main className="relative grid min-h-svh place-items-center px-6 py-12">
      {/* Mirrors the signed-in header so the theme toggle does not move after login. */}
      <div className="absolute inset-x-0 top-0 flex h-12 items-center justify-end gap-2 px-4">
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          tabIndex={-1}
          aria-hidden="true"
          className="invisible"
        >
          Sign out
        </Button>
      </div>
      <section className="w-full max-w-sm space-y-6 rounded-xl bg-card p-8 shadow-raised">
        <LogoMark className="size-12 rounded-xl" />
        <div className="space-y-2">
          <h1 className="text-2xl font-medium tracking-tight text-balance">
            Alchemy Console
          </h1>
          <p className="text-sm text-muted-foreground text-pretty">
            {description}
          </p>
        </div>
        <div className="min-h-10 space-y-3">{action}</div>
      </section>
    </main>
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
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6 sm:py-10">
        <div role="alert" className="space-y-1">
          <p className="font-medium">Couldn’t reach the console server.</p>
          <p className="text-sm text-muted-foreground">
            Reload the page to reconnect. Your stores are unchanged.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  return children;
}

export function AccountMenu() {
  return (
    <div className="flex items-center justify-between gap-2">
      <ThemeToggle />
      <LogoutButton />
    </div>
  );
}

export function AuthBoundary({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionGate>{children}</SessionGate>
    </SessionProvider>
  );
}

function SessionGate({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.pending)
    return (
      <AuthScreen
        description="Your infrastructure, in one place."
        action={
          <p
            role="status"
            className="flex h-10 items-center gap-2 text-sm text-muted-foreground"
          >
            <LoaderCircle
              className="size-4 motion-safe:animate-spin"
              aria-hidden="true"
            />
            Checking your session…
          </p>
        }
      />
    );
  if (session.error)
    return (
      <div className="grid min-h-svh place-items-center">
        <div className="space-y-4 text-center">
          <div role="alert" className="space-y-1">
            <p className="font-medium">Couldn’t check your session.</p>
            <p className="text-sm text-muted-foreground">
              Retry, or reload the page if this keeps happening.
            </p>
          </div>
          <Button onClick={() => void session.refresh()}>Retry</Button>
        </div>
      </div>
    );
  if (!session.account)
    return (
      <AuthScreen
        description="Your infrastructure, in one place."
        action={<GoogleSignIn />}
      />
    );

  return (
    <RpcProvider key={session.account.token}>
      <ConnectionGate>{children}</ConnectionGate>
    </RpcProvider>
  );
}
