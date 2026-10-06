import { Effect } from 'effect';
import { Auth } from '@kstackz/auth-toolkit/clients/auth';
import { Device, type SignedIn, Unreachable } from './services.ts';

/** Who is signed in, and whose Session to open. */
export type Checked = {
  readonly signedIn: ReadonlyArray<SignedIn>;
  readonly chosen: SignedIn | null;
};

/**
 * Asks the Backend who is signed in on this device and opens the Active
 * Session. Every other User's copy is deleted. When the Backend can't be
 * reached, the User last opened here opens from their copy, with no token
 * until the next check.
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
      return { signedIn: [remembered], chosen: remembered };
    }
    const signedIn: ReadonlyArray<SignedIn> = listed.success;
    yield* device.keepCopies(signedIn.map(({ user }) => user.id));
    const chosen = signedIn.find(({ active }) => active) ?? signedIn[0] ?? null;
    yield* device.setLastUser(chosen?.user ?? null);
    return { signedIn, chosen };
  });

/** Makes another User's Session the Active Session, in every tab. */
export const switchTo = (to: SignedIn) =>
  Effect.gen(function* () {
    if (to.token !== null) yield* (yield* Auth).switchTo(to.token);
    yield* (yield* Device).setLastUser(to.user);
    return to;
  });
