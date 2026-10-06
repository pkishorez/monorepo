import type { SyncedCollection } from '@kstackz/std-toolkit/sync';
import type {
  Account,
  Category,
  Entry,
  Preferences,
} from '../../../shared/ledger/index.ts';

/** One person signed in to a Backend. */
export type User = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
};

/**
 * The Active Session: one User's money on this device, a Collection for each
 * kind kept in step with the Backend, and the Backend's own commands. Writes
 * show at once and roll back if the Backend refuses them. Which Backend, and
 * where the copy lives, it does not say.
 */
export interface Session {
  readonly user: User;
  readonly userId: string;
  /** Signs the Session's next calls with a fresh token for its User. */
  readonly setToken: (token: string) => void;
  readonly accounts: SyncedCollection<Account>;
  readonly categories: SyncedCollection<Category>;
  readonly entries: SyncedCollection<Entry>;
  readonly preferences: SyncedCollection<Preferences>;
  /**
   * Writes the sample Accounts and Categories, and with `entries` three
   * Months of Entries, unless the User has Accounts already.
   */
  readonly sample: (entries: boolean) => Promise<void>;
  /** Deletes every Account, Category and Entry. */
  readonly clear: () => Promise<void>;
}
