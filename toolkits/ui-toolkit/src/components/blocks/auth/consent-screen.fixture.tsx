import { ConsentScreen } from './auth-screens';
import {
  account,
  accountsView,
  branding,
  failAfter,
  pause,
  scopeDescriptions,
} from './fixtures/data';

const ready = {
  status: 'ready',
  clientName: 'Claude',
  scopes: ['openid', 'email', 'notes:read', 'notes:write'],
} as const;

export default {
  loading: (
    <ConsentScreen
      branding={branding}
      state={{ status: 'loading' }}
      account={account}
      onAnswer={() => pause()}
    />
  ),
  'asking for Scopes': (
    <ConsentScreen
      branding={branding}
      state={ready}
      account={account}
      scopeDescriptions={scopeDescriptions}
      onAnswer={() => pause(2000)}
    />
  ),
  'several Signed-in Accounts': (
    <ConsentScreen
      branding={branding}
      state={ready}
      account={{ email: account.email }}
      accounts={accountsView(3)}
      scopeDescriptions={scopeDescriptions}
      onAnswer={() => pause(2000)}
    />
  ),
  'identity only': (
    <ConsentScreen
      branding={branding}
      state={{ status: 'ready', clientName: 'Codex', scopes: [] }}
      account={account}
      onAnswer={() => pause(2000)}
    />
  ),
  'answer fails': (
    <ConsentScreen
      branding={branding}
      state={ready}
      account={account}
      scopeDescriptions={scopeDescriptions}
      onAnswer={() => failAfter('Could not record your answer. Try again.')}
    />
  ),
  'unknown app': (
    <ConsentScreen
      branding={branding}
      state={{ status: 'failed', reason: 'This app is not registered here.' }}
      account={account}
      onAnswer={() => pause()}
    />
  ),
};
