import { Effect } from 'effect';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import type { User } from '@ledger/core/client/session';

// The keychain (iOS) or Keystore (Android) entry of the User last opened.
const KEY = 'ledger.last-user';

/** The User last opened on the Remote Backend, kept in secure storage. */
export const lastUser = {
  get: Effect.promise(async (): Promise<User | null> => {
    try {
      const stored = await getItemAsync(KEY);
      return stored === null ? null : (JSON.parse(stored) as User);
    } catch {
      return null;
    }
  }),
  set: (user: User | null) =>
    Effect.tryPromise(() =>
      user === null
        ? deleteItemAsync(KEY)
        : setItemAsync(KEY, JSON.stringify(user)),
    ).pipe(Effect.ignore),
};
