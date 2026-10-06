import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { GoogleButton } from '@kstackz/ui-toolkit/components/ui/google-button';
import { CircleAlert, LoaderCircle } from '@kstackz/ui-toolkit/lucide';
import { type ReactNode, useEffect, useState } from 'react';
import {
  addUser,
  appTheme,
  checkAgain,
  setBackend,
  takeLoginError,
  useBackend,
} from '../../app/index.ts';
import { LedgerMark } from '../parts/index.ts';

/** While Ledger asks who is signed in, opens a User's money, or signs out. */
export function Opening(props: {
  readonly name?: string | undefined;
  readonly signingOut?: boolean;
}) {
  return (
    <Card>
      <p
        role="status"
        className="flex h-10 items-center gap-2 text-sm text-muted-foreground"
      >
        <LoaderCircle
          className="size-4 motion-safe:animate-spin"
          aria-hidden="true"
        />
        {props.signingOut
          ? 'Signing out…'
          : props.name === undefined
            ? 'Checking who is signed in…'
            : `Opening ${props.name}’s money…`}
      </p>
    </Card>
  );
}

/**
 * Nobody is signed in, or the sign-in service could not be reached. Each
 * Backend offers its own sign-in, and the way to the other Backend.
 */
export function SignedOut(props: { readonly unreachable: boolean }) {
  const backend = useBackend();
  if (backend === 'local') {
    return (
      <Card>
        <div className="space-y-3">
          <LocalSignInButton />
          <OtherBackend to="remote" />
        </div>
      </Card>
    );
  }
  if (props.unreachable) {
    return (
      <Card>
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            Couldn’t reach the sign-in service.
          </p>
          <Button variant="outline" onClick={checkAgain}>
            Try again
          </Button>
          <OtherBackend to="local" />
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <div className="space-y-3">
        <GoogleSignIn />
        <OtherBackend to="local" />
      </div>
    </Card>
  );
}

// The way from one Backend to the other.
function OtherBackend(props: { readonly to: 'local' | 'remote' }) {
  return (
    <p className="text-sm text-muted-foreground">
      {props.to === 'local'
        ? 'Or try Ledger on this device, without an account.'
        : 'Or sign in with Google, to keep your money on every device.'}{' '}
      <Button
        variant="link"
        className="h-auto p-0"
        onClick={() => void setBackend(props.to)}
      >
        {props.to === 'local' ? 'Use the Local Backend' : 'Use Google'}
      </Button>
    </p>
  );
}

// Asks who to be on the Local Backend; anyone will do.
function LocalSignInButton() {
  return <Button onClick={() => void addUser()}>Sign in</Button>;
}

function GoogleSignIn() {
  const { theme } = appTheme.useTheme();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  // The error a sign-in came back with, shown once.
  useEffect(() => {
    void takeLoginError().then((taken) => {
      if (taken !== null) {
        setError(taken.description ?? 'Sign in didn’t finish. Try again.');
      }
    });
  }, []);
  const start = async () => {
    setPending(true);
    setError(undefined);
    try {
      await addUser();
    } catch {
      setError('The sign-in service didn’t answer. Try again.');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="w-fit">
        <GoogleButton
          theme={theme}
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() => void start()}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

/** One card for every state before a Session, so nothing jumps between them. */
function Card(props: { readonly children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-12">
      <appTheme.StatusBar />
      <section className="w-full max-w-sm space-y-8">
        <div className="space-y-4">
          <LedgerMark />
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Ledger</h1>
            <p className="text-pretty text-muted-foreground">
              Write down what you spend and earn, and see where it goes. Keys on
              a desktop, a thumb on a phone.
            </p>
          </div>
        </div>
        <div className="min-h-10">{props.children}</div>
      </section>
    </main>
  );
}
