import { Button } from 'kui-toolkit/components/ui/button';
import { Input } from 'kui-toolkit/components/ui/input';
import { Spinner } from 'kui-toolkit/components/ui/spinner';
import { useMemo, useState, type FormEvent } from 'react';

import { createAuthorizationClient, pageQuery } from '../../client/index.js';
import { brandName, PageShell, type Branding } from '../../shell/index.js';
import { ScopeList, type ScopeDescriptions } from '../../scope-list/index.js';

interface DevicePageProps {
  branding: Branding;
  scopes?: ScopeDescriptions;
}

type Step =
  | { status: 'enter'; error?: string | undefined }
  | { status: 'checking'; userCode: string }
  | { status: 'confirm'; userCode: string; clientId: string; scope: string }
  | { status: 'done'; approved: boolean };

const normalizeCode = (raw: string) => raw.trim().toUpperCase();

export function DevicePage({ branding, scopes = {} }: DevicePageProps) {
  const appName = brandName(branding);
  const client = useMemo(createAuthorizationClient, []);
  const { data: session, isPending } = client.useSession();
  const [code, setCode] = useState(() => pageQuery().get('user_code') ?? '');
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
      clientId: data.client_id ?? 'A device',
      scope: data.scope ?? '',
    });
  };

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

  if (step.status === 'done') {
    return (
      <PageShell
        branding={branding}
        title={step.approved ? 'Device connected' : 'Request denied'}
        description={
          step.approved
            ? 'You can return to the device. This page can be closed.'
            : 'The device was not given access. This page can be closed.'
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
        title="Allow this device?"
        description={`${step.clientId} wants to access your ${appName} account.`}
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
              {busy ? <Spinner /> : 'Allow'}
            </Button>
          </div>
        }
      >
        <ScopeList
          requested={step.scope.split(' ').filter(Boolean)}
          descriptions={scopes}
        />
      </PageShell>
    );
  }

  const checking = step.status === 'checking';
  return (
    <PageShell
      loading={isPending}
      branding={branding}
      title="Connect a device"
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
          className="h-11 text-center font-mono text-base tracking-[0.2em] tabular-nums uppercase placeholder:tracking-normal placeholder:normal-case"
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
