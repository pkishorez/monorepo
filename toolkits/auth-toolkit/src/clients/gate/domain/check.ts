import { Effect, Schema } from 'effect';
import { Auth } from '../../auth/index.js';
import { Device } from './services.js';
import type { Account } from './types.js';

/** The Backend could not be reached, and nobody was open here before to
 * open without it. */
export class Unreachable extends Schema.Error<Unreachable>(
  '@kstackz/auth-toolkit/gate/Unreachable',
)({ _tag: Schema.tag('Unreachable') }) {}

/** Who is signed in, and whose Session Lifetime to open. */
export type Checked = {
  readonly accounts: ReadonlyArray<Account>;
  readonly chosen: Account | null;
};

/**
 * Asks the Backend who is signed in on this device and chooses the Active
 * Account. What the device keeps for anyone else is deleted. When the
 * Backend can't be reached, the account last open here is chosen, with no
 * token until the next check.
 */
export const check: Effect.Effect<Checked, Unreachable, Auth | Device> =
  Effect.gen(function* () {
    const auth = yield* Auth;
    const device = yield* Device;
    const listed = yield* Effect.result(auth.list);
    if (listed._tag === 'Failure') {
      const last = yield* device.lastUser;
      if (last === null) return yield* new Unreachable();
      const remembered = { user: last, token: null, active: true };
      return { accounts: [remembered], chosen: remembered };
    }
    const accounts: ReadonlyArray<Account> = listed.success;
    yield* device.keep(accounts.map(({ user }) => user.id));
    const chosen = accounts.find(({ active }) => active) ?? accounts[0] ?? null;
    yield* device.setLastUser(chosen?.user ?? null);
    return { accounts, chosen };
  });
