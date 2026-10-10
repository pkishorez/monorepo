import { CircleAlert, LoaderCircle } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { Button } from '#components/ui/button';
import { GoogleButton } from '#components/ui/google-button';

/** What stands in for an app while no Account is open, one per state. */
export type GateScreen =
  | { kind: 'checking' }
  | { kind: 'signingOut' }
  | { kind: 'opening'; name: string }
  | { kind: 'signedOut'; unreachable: boolean }
  | { kind: 'unopenable'; name: string };

export interface GateScreensProps {
  /** The app's name, as every screen titles it. */
  title: string;
  /** One line on what the app is for. */
  description?: string;
  /** The app's mark, above its name. */
  mark?: ReactNode;
  /** Whatever colors the status bar, such as the Theme's strip. */
  statusBar?: ReactNode;
  /** For the Google button. */
  theme: 'light' | 'dark';
  screen: GateScreen;
  /** The Backend running, and whether the app has a device Backend to
   * offer. */
  backend: 'cloud' | 'device' | null;
  hasDevice: boolean;
  /** Why the last sign-in came back with nobody, shown once. */
  loginError?: string | null;
  onLoginErrorShown?: () => void;
  onSignIn: () => Promise<void> | void;
  onCheckAgain: () => void;
  onRetry: () => void;
  onSignOut: () => void;
  onBackend: (backend: 'cloud' | 'device') => void;
}

/**
 * Every screen an app shows before an Account is open: checking who is
 * signed in, opening an Account, signing out, signed out (Google on the
 * cloud Backend, a name on the device Backend, and the way to the other),
 * and an Account that would not open. One card for all of them, so nothing
 * jumps between them. An Account Lost is the Account Lost recipe.
 */
export function GateScreens(props: GateScreensProps) {
  const { screen, title } = props;
  switch (screen.kind) {
    case 'checking':
    case 'signingOut':
    case 'opening':
      return (
        <Card {...props}>
          <p
            role="status"
            className="flex h-10 items-center gap-2 text-sm text-muted-foreground"
          >
            <LoaderCircle
              className="size-4 motion-safe:animate-spin"
              aria-hidden="true"
            />
            {screen.kind === 'signingOut'
              ? 'Signing out…'
              : screen.kind === 'checking'
                ? 'Checking who is signed in…'
                : `Opening ${screen.name}’s ${title}…`}
          </p>
        </Card>
      );
    case 'unopenable':
      return (
        <Card {...props}>
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              Couldn’t open {screen.name}’s {title} on this device.
            </p>
            <div className="flex gap-2">
              <Button onClick={props.onRetry}>Try again</Button>
              <Button variant="outline" onClick={props.onSignOut}>
                Sign out {screen.name}
              </Button>
            </div>
          </div>
        </Card>
      );
    case 'signedOut':
      return <SignedOut {...props} unreachable={screen.unreachable} />;
  }
}

function SignedOut(props: GateScreensProps & { unreachable: boolean }) {
  if (props.backend === 'device') {
    return (
      <Card {...props}>
        <div className="space-y-3">
          <Button onClick={() => void props.onSignIn()}>Sign in</Button>
          <OtherBackend {...props} to="cloud" />
        </div>
      </Card>
    );
  }
  if (props.unreachable) {
    return (
      <Card {...props}>
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            Couldn’t reach the sign-in service.
          </p>
          <Button variant="outline" onClick={props.onCheckAgain}>
            Try again
          </Button>
          {props.hasDevice && <OtherBackend {...props} to="device" />}
        </div>
      </Card>
    );
  }
  return (
    <Card {...props}>
      <div className="space-y-3">
        <GoogleSignIn {...props} />
        {props.hasDevice && <OtherBackend {...props} to="device" />}
      </div>
    </Card>
  );
}

// The way from one Backend to the other.
function OtherBackend(props: GateScreensProps & { to: 'device' | 'cloud' }) {
  return (
    <p className="text-sm text-muted-foreground">
      {props.to === 'device'
        ? `Or try ${props.title} on this device, without an account.`
        : 'Or sign in with Google, to keep everything on every device.'}{' '}
      <Button
        variant="link"
        className="h-auto p-0"
        onClick={() => props.onBackend(props.to)}
      >
        {props.to === 'device' ? 'Use this device' : 'Use Google'}
      </Button>
    </p>
  );
}

function GoogleSignIn(props: GateScreensProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const { loginError, onLoginErrorShown } = props;
  // The error a sign-in came back with, shown once.
  useEffect(() => {
    if (loginError == null) return;
    setError(loginError);
    onLoginErrorShown?.();
  }, [loginError, onLoginErrorShown]);
  const start = async () => {
    setPending(true);
    setError(undefined);
    try {
      await props.onSignIn();
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
          theme={props.theme}
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

function Card(props: GateScreensProps & { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 py-12">
      {props.statusBar}
      <section className="w-full max-w-sm space-y-8">
        <div className="space-y-4">
          {props.mark}
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {props.title}
            </h1>
            {props.description && (
              <p className="text-pretty text-muted-foreground">
                {props.description}
              </p>
            )}
          </div>
        </div>
        <div className="min-h-10">{props.children}</div>
      </section>
    </main>
  );
}
