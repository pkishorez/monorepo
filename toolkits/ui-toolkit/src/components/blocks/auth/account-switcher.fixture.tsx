import { useState } from 'react';

import { HomeScreen, LoginScreen, type AccountsView } from './auth-screens';
import {
  accountsView,
  branding,
  failAfter,
  grants,
  now,
  pause,
  scopeDescriptions,
  sessions,
  signedInAccounts,
  user,
} from './fixtures/data';

const handlers = {
  onReauthenticate: () => pause(),
  onRevokeSession: () => pause(),
  onRevokeOtherSessions: () => pause(),
  onRevokeGrant: () => pause(),
};

/** Switches, signs out, and adds for real. Adding cycles through the
 * remaining fixture accounts until the limit. */
function LiveSwitcher({
  limit = 5,
  failing = false,
}: {
  limit?: number;
  failing?: boolean;
}) {
  const [ids, setIds] = useState(['a-ada', 'a-work']);
  const [activeId, setActiveId] = useState('a-ada');
  const byId = (id: string) =>
    signedInAccounts.find((account) => account.id === id)!;

  const active = byId(activeId);
  const others = ids.filter((id) => id !== activeId).map(byId);
  const accounts: AccountsView = {
    active,
    others,
    canAdd: ids.length < limit,
    onSwitch: async (id) => {
      if (failing) return failAfter('Could not switch account. Try again.');
      await pause();
      setActiveId(id);
    },
    onAdd: () => {
      const next = signedInAccounts.find(
        (account) => !ids.includes(account.id),
      );
      if (!next) return;
      setIds([...ids, next.id]);
      setActiveId(next.id);
    },
    onSignOut: async () => {
      await pause();
      const rest = ids.filter((id) => id !== activeId);
      setIds(rest);
      if (rest[0]) setActiveId(rest[0]);
    },
    onSignOutAll: async () => {
      await pause(1500);
      setIds([]);
    },
  };

  if (ids.length === 0) {
    return (
      <LoginScreen
        branding={branding}
        state={{ status: 'ready', continuing: false }}
        onSignIn={() => pause()}
      />
    );
  }
  return (
    <HomeScreen
      branding={branding}
      now={now}
      scopeDescriptions={scopeDescriptions}
      accounts={accounts}
      state={{
        status: 'ready',
        user: { name: active.name, email: active.email },
        sessions,
        grants,
      }}
      onSignOut={accounts.onSignOut}
      {...handlers}
    />
  );
}

const home = (count: number, overrides?: Partial<AccountsView>) => (
  <HomeScreen
    branding={branding}
    now={now}
    scopeDescriptions={scopeDescriptions}
    accounts={accountsView(count, overrides)}
    state={{ status: 'ready', user, sessions, grants }}
    onSignOut={() => pause()}
    {...handlers}
  />
);

export default {
  live: <LiveSwitcher />,
  'live, switching fails': <LiveSwitcher failing />,
  'live, limit of 2': <LiveSwitcher limit={2} />,
  /** No `accounts`: the screen exactly as before, no switcher. */
  'multi-session off': (
    <HomeScreen
      branding={branding}
      now={now}
      scopeDescriptions={scopeDescriptions}
      state={{ status: 'ready', user, sessions, grants }}
      onSignOut={() => pause()}
      {...handlers}
    />
  ),
  'one account, more allowed': home(1),
  'two accounts': home(2),
  'five accounts, at the limit': home(5),
  'account without a name': home(3, {
    active: signedInAccounts[2]!,
    others: [signedInAccounts[0]!, signedInAccounts[1]!],
  }),
  'long email': home(2, {
    active: signedInAccounts[3]!,
    others: [signedInAccounts[0]!],
  }),
};
