import { Effect } from 'effect';
import { Unauthenticated } from '../../authz/middleware/index.js';
import type { Account, AccountsState } from '../accounts/index.js';

const notSignedIn = new Unauthenticated({ reason: 'Not signed in' });

/** Who a call acts as: the Active Account, or while Checking the one last
 * seen. With nothing remembered, the call waits for `settle`. */
export const acting = (
  state: AccountsState,
  settle: Effect.Effect<AccountsState, { readonly message: string }>,
): Effect.Effect<Account, Unauthenticated> => {
  if (state._tag === 'SignedIn') return Effect.succeed(state.active);
  if (state._tag === 'SignedOut') return Effect.fail(notSignedIn);
  if (state.last) return Effect.succeed(state.last);
  return settle.pipe(
    Effect.mapError(({ message }) => new Unauthenticated({ reason: message })),
    Effect.flatMap((settled) =>
      settled._tag === 'SignedIn'
        ? Effect.succeed(settled.active)
        : Effect.fail(notSignedIn),
    ),
  );
};
