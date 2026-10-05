import { Effect } from 'effect';
import {
  Device,
  type SignedIn,
  SignInService,
  Unreachable,
} from './services.ts';

/** Who is signed in, and whose Session to open. */
export type Checked = {
  readonly signedIn: ReadonlyArray<SignedIn>;
  readonly chosen: SignedIn | null;
};

/**
 * Asks the sign-in service who is signed in on this device and picks whose
 * Session to open: this tab's User when Switch User stays in the tab, else
 * the browser's active one. Every other User's copy is deleted. When the
 * service can't be reached, the User last opened here opens from their copy,
 * with no token until the next check.
 */
export const check: Effect.Effect<
  Checked,
  Unreachable,
  SignInService | Device
> = Effect.gen(function* () {
  const service = yield* SignInService;
  const device = yield* Device;
  const listed = yield* Effect.result(service.signedIn);
  if (listed._tag === 'Failure') {
    const last = yield* device.lastUser;
    if (last === null) return yield* new Unreachable();
    const remembered = { user: last, token: null, active: true };
    return { signedIn: [remembered], chosen: remembered };
  }
  const signedIn = listed.success;
  yield* device.keepCopies(signedIn.map(({ user }) => user.id));
  const tabUser =
    (yield* device.switching) === 'tab' ? yield* device.tabUser : null;
  const chosen =
    signedIn.find(({ user }) => user.id === tabUser) ??
    signedIn.find(({ active }) => active) ??
    signedIn[0] ??
    null;
  yield* device.setLastUser(chosen?.user ?? null);
  if (chosen !== null) yield* device.setTabUser(chosen.user.id);
  return { signedIn, chosen };
});

/**
 * Moves to another User: for every tab when Switch User reaches the whole
 * browser, else for this tab alone.
 */
export const switchTo = (to: SignedIn) =>
  Effect.gen(function* () {
    const device = yield* Device;
    if ((yield* device.switching) === 'browser' && to.token !== null) {
      yield* (yield* SignInService).makeActive(to.token);
    }
    yield* device.setTabUser(to.user.id);
    yield* device.setLastUser(to.user);
    return to;
  });
