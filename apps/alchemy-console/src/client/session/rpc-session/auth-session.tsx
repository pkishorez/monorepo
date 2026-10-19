import { Effect, Stream } from 'effect';
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { useComponentLifecycle } from 'use-effect-ts';
import { type Account, AccountsState } from '@kestack/auth-toolkit/client';
import { accounts } from '../../connections/auth/index.ts';

type Session = {
  pending: boolean;
  error: boolean;
  /** The Active Account; null when signed out. */
  account: Account | null;
  /** Asks the Auth Worker again, keeping the current account on screen
   * meanwhile. */
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Session>({
  pending: true,
  error: false,
  account: null,
  refresh: async () => {},
});

const check = accounts.pipe(Effect.flatMap(({ check }) => check));

// Follows the browser's Accounts: a switch or sign-out in another tab, or a
// call refused Account Changed, lands here as a new state.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountsState>(() =>
    AccountsState.Checking({}),
  );
  const [failed, setFailed] = useState(false);

  const refresh = () =>
    Effect.runPromise(
      check.pipe(
        Effect.match({
          onFailure: () => setFailed(true),
          onSuccess: () => setFailed(false),
        }),
      ),
    );

  useComponentLifecycle(
    Effect.gen(function* () {
      const { state } = yield* accounts;
      // The Layer checks on start too; this check is the one whose failure
      // the screen can show.
      yield* Effect.forkScoped(Effect.promise(refresh));
      yield* Stream.runForEach(state, (next) =>
        Effect.sync(() => setState(next)),
      );
    }),
  );

  const session: Session = {
    pending: state._tag === 'Checking' && !failed,
    error: state._tag === 'Checking' && failed,
    account: state._tag === 'SignedIn' ? state.active : null,
    refresh,
  };
  return <SessionContext value={session}>{children}</SessionContext>;
}

export const useSession = () => useContext(SessionContext);
