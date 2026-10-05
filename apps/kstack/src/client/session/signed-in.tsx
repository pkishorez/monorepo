import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { GoogleButton } from '@kstackz/ui-toolkit/components/ui/google-button';
import { CircleAlert, LoaderCircle } from '@kstackz/ui-toolkit/lucide';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { appTheme } from '../../common/theme.ts';
import { authClient } from './auth.ts';

export type User = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
};

const UserContext = createContext<User | undefined>(undefined);

/** The signed-in user; only inside a UserProvider. */
export const useUser = () => {
  const user = useContext(UserContext);
  if (user === undefined)
    throw new Error('useUser must be inside UserProvider');
  return user;
};

/** Gives everything inside the user it is for. */
export function UserProvider(props: {
  readonly user: User;
  readonly children: ReactNode;
}) {
  return <UserContext value={props.user}>{props.children}</UserContext>;
}

/**
 * Shows `children` to a signed-in user, and the sign-in card to anyone
 * else.
 */
export function SignedIn(props: {
  readonly children: (user: User) => ReactNode;
}) {
  const session = authClient.useSession();
  if (session.isPending) {
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
          Checking your session…
        </p>
      </Card>
    );
  }
  if (session.error) {
    return (
      <Card>
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            Couldn’t check your session.
          </p>
          <Button variant="outline" onClick={() => void session.refetch()}>
            Try again
          </Button>
        </div>
      </Card>
    );
  }
  if (!session.data) {
    return (
      <Card>
        <GoogleSignIn />
        {import.meta.env.DEV && (
          <a
            href="/?preview=on"
            className="mt-4 block text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Or try a preview with sample money, kept in this tab only
          </a>
        )}
      </Card>
    );
  }
  const { user } = session.data;
  const signedIn: User = {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image ?? null,
  };
  return props.children(signedIn);
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

/** One card for every state before a session, so nothing jumps between them. */
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

/** The app's mark: three bars, the last one rising. */
export function LedgerMark(props: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={props.className ?? 'size-12'}
    >
      <rect width="32" height="32" rx="9" className="fill-foreground" />
      <rect
        x="8"
        y="17"
        width="4"
        height="7"
        rx="2"
        className="fill-background"
      />
      <rect
        x="14"
        y="13"
        width="4"
        height="11"
        rx="2"
        className="fill-background"
      />
      <rect
        x="20"
        y="8"
        width="4"
        height="16"
        rx="2"
        className="fill-background"
      />
    </svg>
  );
}
