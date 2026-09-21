import {
  DeviceScreen,
  type Branding,
  type DeviceState,
} from 'kui-toolkit/components/blocks/auth';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import {
  createAuthorizationClient,
  pageQuery,
  unwrap,
  type AuthorizationClient,
} from '../../client/index.js';
import { useScreenRoute } from '../../screen-routing/index.js';
import {
  useSignedInAccounts,
  type MultiSessionOptions,
} from '../../signed-in-accounts/index.js';

interface DevicePageProps {
  branding: Branding;
  multiSession: MultiSessionOptions | undefined;
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
  return { userCode, clientId: found.client_id ?? 'Unknown device' };
};

export function DevicePage({ branding, multiSession }: DevicePageProps) {
  const client = useMemo(createAuthorizationClient, []);
  const session = client.useSession();
  const show = useScreenRoute('device', session);
  const accounts = useSignedInAccounts(client, session.data, multiSession);
  const [prefilled] = useState(() => pageQuery().get('user_code') ?? '');
  const [step, setStep] = useState<DeviceState>(
    prefilled ? { status: 'loading' } : { status: 'enter' },
  );

  useEffect(() => {
    if (!show || !prefilled) return;
    let current = true;
    lookUp(client, prefilled).then(
      (found) => current && setStep({ status: 'confirm', ...found }),
      (cause: Error) =>
        current &&
        setStep({ status: 'enter', code: prefilled, error: cause.message }),
    );
    return () => {
      current = false;
    };
  }, [client, show, prefilled]);

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

  const check = async (code: string) => {
    const found = await lookUp(client, code);
    setStep({ status: 'confirm', ...found });
  };

  const answer = async (approved: boolean) => {
    if (step.status !== 'confirm') return;
    const { userCode, clientId } = step;
    try {
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
    } catch (cause) {
      setStep({
        status: 'enter',
        code: userCode,
        error: (cause as Error).message,
      });
    }
  };

  return (
    <DeviceScreen
      branding={branding}
      state={show ? step : { status: 'loading' }}
      account={
        session.data
          ? {
              email: session.data.user.email,
              onSignOut: multiSession ? undefined : () => void client.signOut(),
            }
          : undefined
      }
      accounts={accounts}
      onCheck={check}
      onAnswer={answer}
    />
  );
}
