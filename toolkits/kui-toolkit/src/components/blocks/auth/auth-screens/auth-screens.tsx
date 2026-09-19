import { CircleAlert } from 'lucide-react';
import { useState } from 'react';

import { GoogleButton } from '#components/ui/google-button';
import { useTheme } from 'next-themes';

import { Button, buttonVariants } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';

import { ActionButton, useAction, type Action } from '../action-button';
import { GrantList, type GrantView } from '../grant-list';
import { ScopeList, type ScopeDescriptions } from '../scope-list';
import { brandName, ScreenFrame, type Branding } from '../screen-frame';
import { SessionList, type SessionView } from '../session-list';
import { AccountHeader, type UserView } from './account-header';
import { DeviceCodeForm } from './device-code-form';

export type { Branding, GrantView, ScopeDescriptions, SessionView, UserView };

interface Account {
  email: string;
  onSignOut: () => void;
}

export type LoginState =
  | { status: 'loading' }
  | {
      status: 'ready';
      continuing: boolean;
      error?: string | undefined;
    };

export function LoginScreen({
  branding,
  state,
  onSignIn,
}: {
  branding: Branding;
  state: LoginState;
  onSignIn: Action;
}) {
  const app = brandName(branding);
  const { resolvedTheme } = useTheme();
  const signIn = useAction(onSignIn);
  const ready = state.status === 'ready' ? state : undefined;
  return (
    <ScreenFrame
      branding={branding}
      loading={!ready}
      title={ready?.continuing ? 'Sign in to continue' : `Sign in to ${app}`}
      description={
        ready?.continuing
          ? 'An app wants to use your account. Sign in to confirm it is you.'
          : `One Google account for every ${app} app.`
      }
    >
      {ready?.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {ready.error}
        </p>
      ) : null}
      <div className="flex justify-center">
        <GoogleButton
          theme={resolvedTheme === 'light' ? 'light' : 'dark'}
          disabled={signIn.pending}
          onClick={signIn.run}
        />
      </div>
    </ScreenFrame>
  );
}

export type HomeState =
  | { status: 'loading' }
  | { status: 'reauthenticate' }
  | { status: 'failed'; reason: string }
  | {
      status: 'ready';
      user: UserView;
      sessions: ReadonlyArray<SessionView>;
      grants?: ReadonlyArray<GrantView> | undefined;
    };

export function HomeScreen({
  branding,
  state,
  scopeDescriptions = {},
  now,
  onSignOut,
  onReauthenticate,
  onRevokeSession,
  onRevokeOtherSessions,
  onRevokeGrant,
  onRetry,
}: {
  branding: Branding;
  state: HomeState;
  scopeDescriptions?: ScopeDescriptions | undefined;
  now?: Date | undefined;
  onSignOut: Action;
  onReauthenticate: Action;
  onRevokeSession: (id: string) => Promise<unknown>;
  onRevokeOtherSessions: Action;
  onRevokeGrant: (clientId: string) => Promise<unknown>;
  onRetry?: (() => void) | undefined;
}) {
  if (state.status === 'loading') {
    return <ScreenFrame branding={branding} loading />;
  }
  if (state.status === 'reauthenticate') {
    return (
      <ScreenFrame
        branding={branding}
        loading={false}
        title="Confirm it's you"
        description="For your security, sign in again to manage your sessions and apps."
        footer={
          <ActionButton size="lg" className="w-full" action={onReauthenticate}>
            Sign in again
          </ActionButton>
        }
      />
    );
  }
  if (state.status === 'failed') {
    return (
      <ScreenFrame
        branding={branding}
        loading={false}
        title="Your account could not load"
        description={state.reason}
        footer={
          onRetry ? (
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              onClick={onRetry}
            >
              Try again
            </Button>
          ) : null
        }
      />
    );
  }
  return (
    <ScreenFrame
      branding={branding}
      loading={false}
      header={
        <AccountHeader
          branding={branding}
          user={state.user}
          onSignOut={onSignOut}
        />
      }
    >
      <HomeLists
        state={state}
        now={now}
        scopeDescriptions={scopeDescriptions}
        onSignOut={onSignOut}
        onRevokeSession={onRevokeSession}
        onRevokeOtherSessions={onRevokeOtherSessions}
        onRevokeGrant={onRevokeGrant}
      />
    </ScreenFrame>
  );
}

function HomeLists({
  state,
  now,
  scopeDescriptions,
  onSignOut,
  onRevokeSession,
  onRevokeOtherSessions,
  onRevokeGrant,
}: {
  state: Extract<HomeState, { status: 'ready' }>;
  now: Date | undefined;
  scopeDescriptions: ScopeDescriptions;
  onSignOut: Action;
  onRevokeSession: (id: string) => Promise<unknown>;
  onRevokeOtherSessions: Action;
  onRevokeGrant: (clientId: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-8">
      <SessionList
        open={open}
        onOpenChange={setOpen}
        sessions={state.sessions}
        now={now}
        onSignOut={onSignOut}
        onRevoke={onRevokeSession}
        onRevokeOthers={onRevokeOtherSessions}
      />
      {state.grants ? (
        <GrantList
          open={open}
          onOpenChange={setOpen}
          grants={state.grants}
          descriptions={scopeDescriptions}
          onRevoke={onRevokeGrant}
        />
      ) : null}
    </div>
  );
}

export type ConsentState =
  | { status: 'loading' }
  | { status: 'failed'; reason: string }
  | { status: 'ready'; clientName: string; scopes: ReadonlyArray<string> };

export function ConsentScreen({
  branding,
  state,
  account,
  scopeDescriptions = {},
  onAnswer,
}: {
  branding: Branding;
  state: ConsentState;
  account: Account | undefined;
  scopeDescriptions?: ScopeDescriptions | undefined;
  onAnswer: (allowed: boolean) => Promise<unknown>;
}) {
  const app = brandName(branding);
  if (state.status === 'loading') {
    return <ScreenFrame branding={branding} loading />;
  }
  if (state.status === 'failed') {
    return (
      <ScreenFrame
        branding={branding}
        loading={false}
        title="This request can't continue"
        description={state.reason}
        account={account}
      >
        <p className="text-sm text-muted-foreground">
          Nothing was shared. Go back to the app and try again.
        </p>
      </ScreenFrame>
    );
  }
  return (
    <ScreenFrame
      branding={branding}
      loading={false}
      title={`Allow ${state.clientName} to use your account?`}
      description={`${state.clientName} wants to act for you in ${app}. It will be able to:`}
      account={account}
      footer={<Answers onAnswer={onAnswer} accept="Allow" />}
    >
      <ScopeList requested={state.scopes} descriptions={scopeDescriptions} />
      <p className="text-xs text-pretty text-muted-foreground">
        You can revoke this access at any time from{' '}
        <a
          href="/"
          className="underline underline-offset-3 hover:text-foreground"
        >
          your account
        </a>
        .
      </p>
    </ScreenFrame>
  );
}

export type DeviceState =
  | { status: 'loading' }
  | { status: 'enter'; code?: string | undefined; error?: string | undefined }
  | { status: 'confirm'; userCode: string; clientId: string }
  | { status: 'finishing'; userCode: string; clientId: string }
  | { status: 'stalled'; clientId: string }
  | { status: 'done'; approved: boolean; clientId: string };

export function DeviceScreen({
  branding,
  state,
  account,
  onCheck,
  onAnswer,
}: {
  branding: Branding;
  state: DeviceState;
  account: Account | undefined;
  onCheck: (code: string) => Promise<unknown>;
  onAnswer: (approved: boolean) => Promise<unknown>;
}) {
  switch (state.status) {
    case 'loading':
      return <ScreenFrame branding={branding} loading />;
    case 'enter':
      return (
        <ScreenFrame
          branding={branding}
          loading={false}
          title="Sign in on your device"
          description="Enter the code your device shows to sign it in to your account."
          account={account}
        >
          <DeviceCodeForm
            initialCode={state.code}
            initialError={state.error}
            onCheck={onCheck}
          />
        </ScreenFrame>
      );
    case 'confirm':
      return (
        <ScreenFrame
          branding={branding}
          loading={false}
          title="Is this your device?"
          description="Sign in only if this code matches the one your device shows."
          account={account}
          footer={<Answers onAnswer={onAnswer} accept="Sign in" />}
        >
          <dl className="grid grid-cols-1 divide-y divide-border/60 rounded-lg ring-1 ring-foreground/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="flex flex-col gap-1 px-4 py-3.5">
              <dt className="text-xs text-muted-foreground">Device</dt>
              <dd className="truncate text-base font-medium">
                {state.clientId}
              </dd>
            </div>
            <div className="flex flex-col gap-1 px-4 py-3.5">
              <dt className="text-xs text-muted-foreground">Code</dt>
              <dd className="font-mono text-base font-semibold tracking-[0.2em] tabular-nums">
                {state.userCode}
              </dd>
            </div>
          </dl>
        </ScreenFrame>
      );
    case 'finishing':
      return (
        <ScreenFrame
          branding={branding}
          loading={false}
          title="Finishing sign-in"
          description={`You approved ${state.clientId}. It is signing in now, which takes a few seconds.`}
          account={account}
        >
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Waiting for {state.clientId}
          </p>
        </ScreenFrame>
      );
    case 'stalled':
      return (
        <ScreenFrame
          branding={branding}
          loading={false}
          title="Your device has not signed in yet"
          description={`${state.clientId} has not picked up your approval. Check that it is still running, or run its login again.`}
          account={account}
          footer={sessionsLink}
        />
      );
    case 'done':
      return (
        <ScreenFrame
          branding={branding}
          loading={false}
          title={state.approved ? 'Your device is signed in' : 'Sign-in denied'}
          description={
            state.approved
              ? `Go back to ${state.clientId}. You can close this page.`
              : 'Nothing was signed in. You can close this page.'
          }
          account={account}
          footer={sessionsLink}
        >
          <p className="text-sm text-pretty text-muted-foreground">
            {state.approved
              ? `${state.clientId} now appears in your sessions. You can sign it out there at any time.`
              : 'If you did not start this sign-in, you can check which devices have access to your account.'}
          </p>
        </ScreenFrame>
      );
  }
}

export function NotFoundScreen({ branding }: { branding: Branding }) {
  return (
    <ScreenFrame
      branding={branding}
      loading={false}
      title="Page not found"
      description="This page does not exist. The link may be wrong or out of date."
      footer={homeLink('Go to your account')}
    />
  );
}

export function ErrorScreen({
  branding,
  error,
  description,
}: {
  branding: Branding;
  error: string | undefined;
  description: string | undefined;
}) {
  const code = error && error !== 'UNKNOWN' ? error : undefined;
  return (
    <ScreenFrame
      branding={branding}
      loading={false}
      title="Sign-in could not finish"
      description={description ?? 'Something went wrong. Try signing in again.'}
      footer={
        <div className="flex flex-col gap-2">
          <a
            href="/login"
            className={buttonVariants({ size: 'lg', className: 'w-full' })}
          >
            Try signing in again
          </a>
          {homeLink('Go to your account')}
        </div>
      }
    >
      {code ? (
        <p className="text-xs text-muted-foreground">
          Error code: <span className="font-mono">{code}</span>
        </p>
      ) : null}
    </ScreenFrame>
  );
}

const homeLink = (label: string) => (
  <a
    href="/"
    className={buttonVariants({
      variant: 'outline',
      size: 'lg',
      className: 'w-full',
    })}
  >
    {label}
  </a>
);

const sessionsLink = homeLink('See your sessions');

function Answers({
  onAnswer,
  accept,
}: {
  onAnswer: (accepted: boolean) => Promise<unknown>;
  accept: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <ActionButton variant="outline" size="lg" action={() => onAnswer(false)}>
        Deny
      </ActionButton>
      <ActionButton size="lg" action={() => onAnswer(true)}>
        {accept}
      </ActionButton>
    </div>
  );
}
