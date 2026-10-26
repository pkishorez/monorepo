import { Context } from 'effect';
import type { Effect } from 'effect';

/*
 * What this device keeps of the Accounts signed in on it: each one's own
 * database, `code:account:<accountId>`, and every database under it, so
 * all of an Account goes with it.
 *
 * 1. Name     an Account's database, under the prefix of every Account's.
 * 2. Storage  the databases this device keeps, by their place in the
 *             tree. Whoever checks a level deletes the children it no
 *             longer lists, never itself, and only on a real answer: a
 *             failed or refused check deletes nothing. What the user asks
 *             to go goes at once. Each level names its own databases; the
 *             Connection's store deletes by them (`connections/connection/store/`).
 *             - Accounts  the Account step, once the Auth Worker has
 *                         answered.
 *             - Connections  an Account's Connections, once Cloud Connect has
 *                         answered.
 *             - Forget    one Connection the user forgot.
 *
 * How every store on this device keeps its rows, the Preferences, the
 * Connection Filter, the cache, the Unseen marks and the Saved Drafts alike,
 * is `rows/`.
 *
 * `IDB.prune` reads a name as segments split by `:`, so `accounts`, kept
 * to the Accounts signed in here, deletes every other Account and all
 * under it.
 */

// 1. Name
/** The prefix of every Account's database, and all under them. */
export const accounts = 'code:account:';

/** The database of one Account. */
export const account = (accountId: string) => `${accounts}${accountId}`;

// 2. Storage
/** The Capability that deletes what a level no longer lists. */
export class Storage extends Context.Service<
  Storage,
  {
    /**
     * Accounts: deletes every Account's databases but those of the
     * Accounts signed in on this device, and all under them: its cache,
     * its local tables, its Connections and their sync. Best effort.
     */
    readonly pruneAccounts: (
      signedIn: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
    /**
     * Connections: deletes the databases of every Connection of the Account but
     * those listed, and all under them; never the Account's own. Best
     * effort.
     */
    readonly pruneConnections: (
      accountId: string,
      listed: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
    /** Forget: deletes one Connection's database and all under it, and no other's. Best effort. */
    readonly dropConnection: (
      accountId: string,
      connectionId: string,
    ) => Effect.Effect<void>;
  }
>()('code/Storage') {}
