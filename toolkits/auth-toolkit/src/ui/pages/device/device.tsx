import { Button } from 'kui-toolkit/components/ui/button';
import { GoogleButton } from 'kui-toolkit/components/ui/google-button';
import { Input } from 'kui-toolkit/components/ui/input';
import { Spinner } from 'kui-toolkit/components/ui/spinner';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { createAuthorizationClient, pageQuery } from '../../client/index.js';
import { PageShell, type Branding } from '../../shell/index.js';

interface DevicePageProps {
  branding: Branding;
}

type Step =
  | { status: 'enter'; error?: string | undefined }
  | { status: 'checking'; userCode: string }
  | { status: 'confirm'; userCode: string; clientId: string }
  | { status: 'done'; approved: boolean };

const normalizeCode = (raw: string) => raw.trim().toUpperCase();

export function DevicePage({ branding }: DevicePageProps) {
  const client = useMemo(createAuthorizationClient, []);
  const { data: session, isPending } = client.useSession();
  const { theme } = useTheme();
  const [prefilled] = useState(() => pageQuery().get('user_code') ?? '');
  const [code, setCode] = useState(prefilled);
  const [step, setStep] = useState<Step>({ status: 'enter' });
  const [busy, setBusy] = useState(false);

  const check = async (raw: string) => {
    const userCode = normalizeCode(raw);
    setStep({ status: 'checking', userCode });
    const { data, error } = await client.device({
      query: { user_code: userCode },
    });
    if (!data || data.status !== 'pending') {
      setStep({
        status: 'enter',
        error:
          error?.error_description ??
          error?.message ??
          'That code is not waiting for approval.',
      });
      return;
    }
    setStep({
      status: 'confirm',
      userCode,
      clientId: data.client_id ?? 'Unknown client',
    });
  };

  const signedIn = !isPending && session !== null;
  useEffect(() => {
    if (signedIn && prefilled) void check(prefilled);
  }, [signedIn, prefilled]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void check(code);
  };

  const answer = async (userCode: string, approved: boolean) => {
    setBusy(true);
    const result = approved
      ? await client.device.approve({ userCode })
      : await client.device.deny({ userCode });
    setBusy(false);
    if (result.error) {
      setStep({
        status: 'enter',
        error: result.error.error_description ?? result.error.message,
      });
      return;
    }
    setStep({ status: 'done', approved });
  };

  const signedInAs = isPending
    ? 'pending'
    : session
      ? { email: session.user.email, signOut: () => client.signOut() }
      : undefined;

  if (!isPending && !session) {
    return (
      <PageShell
        branding={branding}
        title="Sign in"
        description="Sign in to continue."
      >
        <div className="flex h-10 items-center justify-center">
          <GoogleButton
            theme={theme === 'light' ? 'light' : 'dark'}
            onClick={() =>
              client.signIn.social({
                provider: 'google',
                callbackURL: window.location.href,
              })
            }
          />
        </div>
      </PageShell>
    );
  }

  if (step.status === 'done') {
    return (
      <PageShell
        branding={branding}
        title={step.approved ? 'Signed in' : 'Sign-in denied'}
        description={
          step.approved
            ? 'You can return to your device. This page can be closed.'
            : 'You can close this page.'
        }
        signedInAs={signedInAs}
      >
        {null}
      </PageShell>
    );
  }

  if (step.status === 'confirm') {
    return (
      <PageShell
        branding={branding}
        title="Do you want to sign in?"
        description="Confirm that this code matches the one shown on your device."
        signedInAs={signedInAs}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => answer(step.userCode, false)}
            >
              Deny
            </Button>
            <Button disabled={busy} onClick={() => answer(step.userCode, true)}>
              {busy ? <Spinner /> : 'Sign in'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border bg-muted/50 px-4 py-3 text-center">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              Client
            </p>
            <p className="mt-1 text-lg font-semibold">{step.clientId}</p>
          </div>
          <p className="rounded-lg border bg-muted/50 px-4 py-6 text-center font-mono text-3xl font-bold tracking-[0.2em] tabular-nums">
            {step.userCode}
          </p>
        </div>
      </PageShell>
    );
  }

  const checking = step.status === 'checking';
  return (
    <PageShell
      loading={isPending}
      branding={branding}
      title="Sign in"
      description="Enter the code shown on the device."
      signedInAs={signedInAs}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Code from the device"
          autoFocus
          autoComplete="one-time-code"
          spellCheck={false}
          className="h-14 text-center font-mono text-xl font-bold tracking-[0.2em] tabular-nums uppercase placeholder:font-normal placeholder:tracking-normal placeholder:normal-case"
          aria-label="Device code"
        />
        {step.status === 'enter' && step.error ? (
          <p className="text-sm text-destructive">{step.error}</p>
        ) : null}
        <Button type="submit" disabled={checking || code.trim() === ''}>
          {checking ? <Spinner /> : 'Continue'}
        </Button>
      </form>
    </PageShell>
  );
}
