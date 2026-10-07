import { Effect, Schema } from 'effect';
import { SignIn } from '../../account/index.js';
import { Device } from './services.js';
import type { Held, User } from './types.js';

/** The Backend could not be reached, and nobody was open here before to
 * open without it. */
export class Unreachable extends Schema.Error<Unreachable>(
  '@kstackz/auth-toolkit/gate/Unreachable',
)({ _tag: Schema.tag('Unreachable') }) {}

/** Who is signed in, and whose Session to open. */
export type Checked = {
  readonly accounts: ReadonlyArray<Held>;
  /** Null with nobody to open, or while an account is lost. */
  readonly chosen: Held | null;
  /** The account found lost, still waiting for the User. */
  readonly lost: User | null;
  /** Whether the Backend answered; when it did not, everything is as the
   * device remembers it. */
  readonly answered: boolean;
};

const activeOf = (accounts: ReadonlyArray<Held>) =>
  accounts.find(({ active }) => active) ?? accounts[0] ?? null;

/**
 * Asks the Backend who is signed in, remembers it, and chooses the Active
 * Account. `open` is the account open now: if the Backend no longer names
 * it, and this device did not sign it out, it is lost, and stays lost until
 * the User signs in to it again or someone new signs in. What the device
 * keeps for anyone else is deleted. When the Backend can't be reached, the
 * Remembered Accounts stand in for its answer.
 */
export const check = (
  open: User | null,
): Effect.Effect<Checked, Unreachable, SignIn | Device> =>
  Effect.gen(function* () {
    const signIn = yield* SignIn;
    const device = yield* Device;
    const remembered = yield* device.remembered;
    const listed = yield* Effect.result(signIn.list);
    if (listed._tag === 'Failure') {
      const chosen =
        remembered.lost === null ? activeOf(remembered.accounts) : null;
      if (remembered.lost === null && chosen === null)
        return yield* new Unreachable();
      return { ...remembered, chosen, answered: false };
    }
    const accounts: ReadonlyArray<Held> = listed.success;
    const named = (id: string) => accounts.some(({ user }) => user.id === id);
    const someoneNew = accounts.some(
      ({ user }) => !remembered.accounts.some((was) => was.user.id === user.id),
    );
    const lost =
      remembered.lost !== null
        ? named(remembered.lost.id) || someoneNew
          ? null
          : remembered.lost
        : open !== null &&
            !named(open.id) &&
            !(yield* device.signedOutHere(open.id))
          ? open
          : null;
    yield* device.remember({ accounts, lost });
    yield* device.keep([
      ...accounts.map(({ user }) => user.id),
      ...(lost === null ? [] : [lost.id]),
    ]);
    return {
      accounts,
      chosen: lost === null ? activeOf(accounts) : null,
      lost,
      answered: true,
    };
  });
