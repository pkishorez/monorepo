import { Effect } from 'effect';
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { SignedInAccount } from '@kstackz/auth-toolkit/clients/accounts';
import {
  QueryClient,
  QueryClientProvider,
  useEffectQuery,
  useQueryClient,
} from 'use-effect-ts/query';
import { accounts } from '../../connections/auth/index.ts';

type Session = {
  pending: boolean;
  error: boolean;
  /** The Active Account; null when signed out. */
  account: SignedInAccount | null;
  /** Reads the session again, keeping the current one on screen meanwhile. */
  refresh: () => Promise<void>;
};

const sessionKey = ['session'];
const activeAccount = accounts.list.pipe(
  Effect.map((list) => list.find((account) => account.active) ?? null),
);

const SessionContext = createContext<Session>({
  pending: true,
  error: false,
  account: null,
  refresh: async () => {},
});

function SessionState({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const result = useEffectQuery(sessionKey, activeAccount);
  const session: Session = {
    pending: result.isPending,
    // A failed re-read keeps the account it already had.
    error: result.isError && result.data === undefined,
    account: result.data ?? null,
    refresh: () => client.invalidateQueries({ queryKey: sessionKey }),
  };
  return <SessionContext value={session}>{children}</SessionContext>;
}

// Its own cache: the RPC cache is cleared whenever the account changes.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <SessionState>{children}</SessionState>
    </QueryClientProvider>
  );
}

export const useSession = () => useContext(SessionContext);
