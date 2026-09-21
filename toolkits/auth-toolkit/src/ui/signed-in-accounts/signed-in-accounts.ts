import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountsView } from 'kui-toolkit/components/blocks/auth';

import {
  navigate,
  unwrap,
  type AuthorizationClient,
  type UserRecord,
} from '../client/index.js';
import { ADD_ACCOUNT, RETURN_TO } from '../screen-routing/index.js';
import { arrangeAccounts } from './accounts.js';

const ACCOUNTS = ['auth-toolkit', 'accounts'] as const;
/** Every query the pages hold about the Active Account. */
const EVERYTHING = ['auth-toolkit'] as const;

const addAccountUrl = (returnTo: string) =>
  `/login?${new URLSearchParams({ [ADD_ACCOUNT]: '1', [RETURN_TO]: returnTo })}`;

export interface MultiSessionOptions {
  maximumAccounts: number;
}

/** The account switcher's data and actions; `undefined` while the Active
 * Account or the account list is still loading. */
export function useSignedInAccounts(
  client: AuthorizationClient,
  active: { user: UserRecord; session: { token: string } } | null | undefined,
  options: MultiSessionOptions | undefined,
): AccountsView | undefined {
  const queries = useQueryClient();
  const enabled = options !== undefined && active != null;
  const records = useQuery({
    queryKey: ACCOUNTS,
    enabled,
    queryFn: async () =>
      (await unwrap(
        client.multiSession.listDeviceSessions(),
        'Could not load your accounts.',
      )) ?? [],
  });

  if (!enabled || !records.data) return undefined;
  const accounts = arrangeAccounts(
    records.data,
    active,
    options.maximumAccounts,
  );
  const refresh = () => queries.invalidateQueries({ queryKey: EVERYTHING });
  return {
    active: accounts.active,
    others: accounts.others,
    canAdd: accounts.canAdd,
    onSwitch: async (id) => {
      const sessionToken = accounts.tokens[id];
      if (!sessionToken) return;
      await unwrap(
        client.multiSession.setActive({ sessionToken }),
        'Could not switch account. Try again.',
      );
      await refresh();
    },
    onAdd: () =>
      navigate(
        addAccountUrl(window.location.pathname + window.location.search),
      ),
    onSignOut: async () => {
      await unwrap(
        client.multiSession.revoke({ sessionToken: active.session.token }),
        'Could not sign out. Try again.',
      );
      await refresh();
    },
    onSignOutAll: () => client.signOut(),
  };
}
