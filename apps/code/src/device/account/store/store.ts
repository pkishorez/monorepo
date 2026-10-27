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
 *             Machine's store deletes by them (`machines/machine/store/`).
 *             - Accounts  the Account step, once the Auth Worker has
 *                         answered.
 *             - Machines  an Account's Machines, once Cloud Connect has
 *                         answered.
 *             - Forget    one Machine the user forgot.
 *
 * How every store on this device keeps its rows, the Preferences, the
 * Machine Filter, the cache, the Unseen marks and the Saved Drafts alike,
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
     * its local tables, its Machines and their sync. Best effort.
     */
    readonly pruneAccounts: (
      signedIn: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
    /**
     * Machines: deletes the databases of every Machine of the Account but
     * those listed, and all under them; never the Account's own. Best
     * effort.
     */
    readonly pruneMachines: (
      accountId: string,
      listed: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
    /** Forget: deletes one Machine's database and all under it, and no other's. Best effort. */
    readonly dropMachine: (
      accountId: string,
      machineId: string,
    ) => Effect.Effect<void>;
  }
>()('code/Storage') {}
