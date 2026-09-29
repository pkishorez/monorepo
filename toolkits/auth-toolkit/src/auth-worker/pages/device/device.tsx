import {
  DeviceScreen,
  type Branding,
  type DeviceState,
} from '@kstackz/ui-toolkit/components/blocks/auth';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createAuthorizationClient,
  pageQuery,
  unwrap,
  type AuthorizationClient,
} from '../auth-api/index.js';
import { useScreenRoute } from '../screen-routing/index.js';
import {
  useSignedInAccounts,
  type MultiSessionOptions,
} from '../signed-in-accounts/index.js';

interface DevicePageProps {
  branding: Branding;
  multiSession: MultiSessionOptions;
}

const NOT_WAITING =
  'That code is not waiting for approval. Check it and try again.';

const normalizeCode = (raw: string) => raw.trim().toUpperCase();

const lookUp = async (client: AuthorizationClient, raw: string) => {
  const userCode = normalizeCode(raw);
  const found = await unwrap(
    client.device({ query: { user_code: userCode } }),
    NOT_WAITING,
  );
  if (found?.status !== 'pending') throw new Error(NOT_WAITING);
  if (!found.client_id) {
    throw new Error(
      'This code belongs to another account. Switch to that account or get a new code from your device.',
    );
  }
  return { userCode, clientId: found.client_id };
};

export function DevicePage({ branding, multiSession }: DevicePageProps) {
  const client = useMemo(createAuthorizationClient, []);
  const session = client.useSession();
  const show = useScreenRoute('device', session);
  const accounts = useSignedInAccounts(client, session, multiSession);
  const [prefilled] = useState(() => pageQuery().get('user_code') ?? '');
  const [step, setStep] = useState<DeviceState>({
    status: 'enter',
    code: prefilled,
  });
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const finishing = step.status === 'finishing' ? step : undefined;
  const claimed = useQuery({
    queryKey: ['auth-toolkit', 'device-claim', finishing?.userCode],
    enabled: finishing !== undefined,
    refetchInterval: (query) => (query.state.data ? false : 2000),
    queryFn: async () => {
      const { data } = await client.device({
        query: { user_code: finishing!.userCode },
      });
      return data?.status !== 'approved';
    },
  }).data;

  useEffect(() => {
    if (!finishing) return;
    if (claimed) {
      setStep({ status: 'done', approved: true, clientId: finishing.clientId });
      return;
    }
    const timer = setTimeout(
      () => setStep({ status: 'stalled', clientId: finishing.clientId }),
      60_000,
    );
    return () => clearTimeout(timer);
  }, [finishing, claimed]);

  const check = (code: string) =>
    run(async () => {
      const found = await lookUp(client, code);
      setStep({ status: 'confirm', ...found });
    });

  const answer = async (approved: boolean) => {
    if (step.status !== 'confirm') return;
    const { userCode, clientId } = step;
    await unwrap(
      approved
        ? client.device.approve({ userCode })
        : client.device.deny({ userCode }),
      NOT_WAITING,
    );
    setStep(
      approved
        ? { status: 'finishing', userCode, clientId }
        : { status: 'done', approved, clientId },
    );
  };

  // Looking up a code claims it for the current account.
  const canChooseAccount = step.status === 'enter' && !pending;

  return (
    <DeviceScreen
      branding={branding}
      state={show ? step : { status: 'loading' }}
      account={
        session.data
          ? {
              email: session.data.user.email,
            }
          : undefined
      }
      accounts={
        accounts && canChooseAccount
          ? {
              ...accounts,
              onSwitch: (id) => run(() => accounts.onSwitch(id)),
              onSignOut: () => run(accounts.onSignOut),
              onSignOutAll: () => run(accounts.onSignOutAll),
              onAdd: () => {
                if (!busy.current) accounts.onAdd();
              },
            }
          : undefined
      }
      onCheck={pending || !accounts ? undefined : check}
      onAnswer={answer}
    />
  );
}
