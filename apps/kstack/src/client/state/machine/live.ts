import { Effect, Layer } from 'effect';
import { accountsLive } from '@kstackz/auth-toolkit/clients/accounts';
import { reconcileCopies } from '../local-copies/index.ts';
import { openSession, type User } from '../session/index.ts';
import { deviceSettings } from '../settings/index.ts';
import { AUTH_URL } from './auth.ts';
import { Device, Sessions } from './services.ts';

// sessionStorage: the User of this tab, kept across reloads of it.
const TAB_USER = 'ledger:user';
// localStorage: the User last opened on this device, to open offline.
const LAST_USER = 'ledger:last-user';

/** Forgets this tab's User, so the browser's active one opens next. */
export const forgetTabUser = () => sessionStorage.removeItem(TAB_USER);

const readLastUser = (): User | null => {
  try {
    const stored = localStorage.getItem(LAST_USER);
    return stored === null ? null : (JSON.parse(stored) as User);
  } catch {
    return null;
  }
};

const deviceLive = Layer.succeed(Device, {
  switching: Effect.promise(() => deviceSettings().read()).pipe(
    Effect.map(({ switching }) => switching),
  ),
  tabUser: Effect.sync(() => sessionStorage.getItem(TAB_USER)),
  setTabUser: (userId) =>
    Effect.sync(() => sessionStorage.setItem(TAB_USER, userId)),
  lastUser: Effect.sync(readLastUser),
  setLastUser: (user) =>
    Effect.sync(() =>
      user === null
        ? localStorage.removeItem(LAST_USER)
        : localStorage.setItem(LAST_USER, JSON.stringify(user)),
    ),
  keepCopies: (userIds) =>
    Effect.tryPromise(() => reconcileCopies(userIds)).pipe(
      Effect.catch((error) => Effect.logWarning('[copies]', error)),
      Effect.asVoid,
    ),
});

const sessionsLive = Layer.succeed(Sessions, { open: openSession });

/** Everything the app machine needs, in this browser. */
export const appLive = Layer.mergeAll(
  accountsLive({ authWorkerUrl: AUTH_URL }),
  deviceLive,
  sessionsLive,
);
