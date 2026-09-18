import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from 'kui-toolkit/components/ui/avatar';
import { Button } from 'kui-toolkit/components/ui/button';
import { GoogleButton } from 'kui-toolkit/components/ui/google-button';
import { Skeleton } from 'kui-toolkit/components/ui/skeleton';
import { useTheme } from 'next-themes';
import { useMemo } from 'react';

import {
  createAuthorizationClient,
  pageQuery,
  type AuthorizationClient,
} from '../../client/index.js';
import { brandName, PageShell, type Branding } from '../../shell/index.js';

interface AccountPageProps {
  branding: Branding;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

type Session = NonNullable<
  ReturnType<AuthorizationClient['useSession']>['data']
>;

function SignedIn({
  branding,
  session,
  signOut,
}: {
  branding: Branding;
  session: Session;
  signOut: () => void;
}) {
  const { user } = session;
  const appName = brandName(branding);
  return (
    <PageShell
      branding={branding}
      title="You're signed in"
      description={`Signed in across every ${appName} app.`}
    >
      <div className="flex h-10 items-center gap-3">
        <Avatar className="size-10">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback>{initials(user.name || user.email)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-sm font-medium">
            {user.name || user.email}
          </span>
          {user.name ? (
            <span className="truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </PageShell>
  );
}

export function AccountPage({ branding }: AccountPageProps) {
  const appName = brandName(branding);
  const client = useMemo(createAuthorizationClient, []);
  const { data: session, isPending } = client.useSession();
  const query = useMemo(pageQuery, []);
  const continuing = query.has('client_id');
  const error = query.get('error_description');
  const signOut = () => client.signOut();
  const { theme } = useTheme();

  if (session && !isPending && !continuing) {
    return <SignedIn branding={branding} session={session} signOut={signOut} />;
  }

  return (
    <PageShell
      loading={isPending && !continuing}
      branding={branding}
      title={continuing ? 'Sign in to continue' : `Sign in to ${appName}`}
      description={
        continuing
          ? 'An app is asking to use your account. Confirm it is you.'
          : `One Google sign-in for every ${appName} app.`
      }
      signedInAs={
        !continuing
          ? undefined
          : isPending
            ? 'pending'
            : session
              ? { email: session.user.email, signOut }
              : undefined
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex h-10 items-center justify-center">
        {isPending ? (
          <Skeleton className="h-10 w-[183px] rounded-[4px]" />
        ) : (
          <GoogleButton
            theme={theme === 'light' ? 'light' : 'dark'}
            onClick={() => client.signIn.social({ provider: 'google' })}
          />
        )}
      </div>
    </PageShell>
  );
}
