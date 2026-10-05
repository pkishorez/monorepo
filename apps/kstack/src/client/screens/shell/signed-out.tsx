import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { GoogleButton } from '@kstackz/ui-toolkit/components/ui/google-button';
import { CircleAlert, LoaderCircle } from '@kstackz/ui-toolkit/lucide';
import { type ReactNode, useState } from 'react';
import { authClient, checkAgain } from '../../state/machine/index.ts';
import { appTheme } from '../../state/settings/index.ts';
import { LedgerMark } from '../parts/index.ts';

/** While Ledger asks who is signed in, or opens a User's money. */
export function Opening(props: { readonly name?: string | undefined }) {
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
        {props.name === undefined
          ? 'Checking who is signed in…'
          : `Opening ${props.name}’s money…`}
      </p>
    </Card>
  );
}

/** Nobody is signed in, or the sign-in service could not be reached. */
export function SignedOut(props: { readonly unreachable: boolean }) {
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
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <GoogleSignIn />
    </Card>
  );
}

function GoogleSignIn() {
  const { theme } = appTheme.useTheme();
  const loginError = authClient.useLoginError();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const start = async () => {
    setPending(true);
    setError(undefined);
    loginError.dismiss();
    try {
      const result = await authClient.signIn.google();
      if (result.error) {
        setError(result.error.message ?? 'Sign in didn’t finish. Try again.');
      }
    } catch {
      setError('The sign-in service didn’t answer. Try again.');
    } finally {
      setPending(false);
    }
  };
  const shown = error ?? loginError.error?.description;
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
      {shown && (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {shown}
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
