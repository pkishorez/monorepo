import { useEffect, useState } from 'react';

import { DeviceScreen, type DeviceState } from './auth-screens';
import { account, accountsView, branding, pause } from './fixtures/data';

const NOT_WAITING =
  'That code is not waiting for approval. Check it and try again.';

/** Walks every step. Any code works except WRONG. */
function LiveDevice({ prefilled }: { prefilled?: string }) {
  const [state, setState] = useState<DeviceState>({ status: 'loading' });
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setState(
          prefilled
            ? {
                status: 'confirm',
                userCode: prefilled,
                clientId: 'northwind-cli',
              }
            : { status: 'enter' },
        ),
      1000,
    );
    return () => clearTimeout(timer);
  }, [prefilled]);

  return (
    <DeviceScreen
      branding={branding}
      state={state}
      account={account}
      onCheck={async (code) => {
        await pause();
        if (code.trim().toUpperCase() === 'WRONG') throw new Error(NOT_WAITING);
        setState({
          status: 'confirm',
          userCode: code.trim().toUpperCase(),
          clientId: 'northwind-cli',
        });
      }}
      onAnswer={async (approved) => {
        await pause();
        if (!approved) {
          setState({ status: 'done', approved, clientId: 'northwind-cli' });
          return;
        }
        setState({
          status: 'finishing',
          userCode: 'WDJB-MJHT',
          clientId: 'northwind-cli',
        });
        await pause(3000);
        setState({ status: 'done', approved, clientId: 'northwind-cli' });
      }}
    />
  );
}

const quiet = () => pause();

export default {
  live: <LiveDevice />,
  'live, code in the link': <LiveDevice prefilled="WDJB-MJHT" />,
  loading: (
    <DeviceScreen
      branding={branding}
      state={{ status: 'loading' }}
      account={account}
      onCheck={quiet}
      onAnswer={quiet}
    />
  ),
  'several Signed-in Accounts': (
    <DeviceScreen
      branding={branding}
      state={{
        status: 'confirm',
        userCode: 'WDJB-MJHT',
        clientId: 'northwind-cli',
      }}
      account={{ email: account.email }}
      accounts={accountsView(3)}
      onCheck={() => pause()}
      onAnswer={() => pause(2000)}
    />
  ),
  'enter a code': (
    <DeviceScreen
      branding={branding}
      state={{ status: 'enter' }}
      account={account}
      onCheck={quiet}
      onAnswer={quiet}
    />
  ),
  'code from the link was stale': (
    <DeviceScreen
      branding={branding}
      state={{ status: 'enter', code: 'WDJB-MJHT', error: NOT_WAITING }}
      account={account}
      onCheck={quiet}
      onAnswer={quiet}
    />
  ),
  confirm: (
    <DeviceScreen
      branding={branding}
      state={{
        status: 'confirm',
        userCode: 'WDJB-MJHT',
        clientId: 'northwind-cli',
      }}
      account={account}
      onCheck={quiet}
      onAnswer={quiet}
    />
  ),
  finishing: (
    <DeviceScreen
      branding={branding}
      state={{
        status: 'finishing',
        userCode: 'WDJB-MJHT',
        clientId: 'northwind-cli',
      }}
      account={account}
      onCheck={quiet}
      onAnswer={quiet}
    />
  ),
  stalled: (
    <DeviceScreen
      branding={branding}
      state={{ status: 'stalled', clientId: 'northwind-cli' }}
      account={account}
      onCheck={quiet}
      onAnswer={quiet}
    />
  ),
  approved: (
    <DeviceScreen
      branding={branding}
      state={{ status: 'done', approved: true, clientId: 'northwind-cli' }}
      account={account}
      onCheck={quiet}
      onAnswer={quiet}
    />
  ),
  denied: (
    <DeviceScreen
      branding={branding}
      state={{ status: 'done', approved: false, clientId: 'northwind-cli' }}
      account={account}
      onCheck={quiet}
      onAnswer={quiet}
    />
  ),
};
