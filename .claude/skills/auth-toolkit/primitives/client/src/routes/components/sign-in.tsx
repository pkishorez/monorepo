import { Button } from 'kui-toolkit/components/ui/button';
import { GoogleButton } from 'kui-toolkit/components/ui/google-button';
import { authClient } from '../../client/auth/index.ts';

export function SignIn() {
  const { data: session, isPending } = authClient.useSession();
  const { error, dismiss } = authClient.useLoginError();

  // Same height as the button, so the header does not jump once resolved.
  if (isPending) return <div className="mt-6 h-10" aria-busy="true" />;

  if (session) {
    return (
      <div className="mt-6 flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {session.user.email}
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={() => authClient.signOut()}
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col items-start gap-2">
      <GoogleButton onClick={() => authClient.signIn.google()} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error.description ?? error.code}{' '}
          <button type="button" className="underline" onClick={dismiss}>
            Dismiss
          </button>
        </p>
      ) : null}
    </div>
  );
}
