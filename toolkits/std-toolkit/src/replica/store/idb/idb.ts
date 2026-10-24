import { Effect, Stream } from 'effect';
import { IDB } from '../../../db/idb/index.js';
import {
  makeStore,
  spaceTable,
  type Doorbell,
  type Leader,
} from '../contract/index.js';
import {
  broadcastChannelDoorbell,
  type BroadcastChannelConstructor,
} from './doorbell.js';
import { webLocksLeader, type BrowserLockManager } from './web-locks.js';

/*
 * The Store in IndexedDB, shared by a browser's tabs: one database per
 * Instance, named under the Store's prefix, a Web Lock per Instance for its
 * Leader, and a BroadcastChannel for its Doorbell. A browser without one of
 * them goes without: every tab leads, or no tab hears the others.
 *
 * Two Stores with different prefixes, such as one per Account, never meet:
 * their databases, locks and Doorbell topics are all named under their own.
 */

type Globals = {
  readonly navigator?: { readonly locks?: BrowserLockManager };
  readonly BroadcastChannel?: BroadcastChannelConstructor;
  readonly indexedDB?: IDBFactory;
};

export interface IdbOptions {
  /**
   * What every database of this Store is named under: `replica:` unless
   * given, such as `replica:<accountId>:` for one Store per Account. No
   * other Store's prefix may start with it, since this Store lists and
   * prunes everything under it.
   */
  readonly prefix?: string;
}

const factory = (): IDBFactory => {
  const found = (globalThis as Globals).indexedDB;
  if (found === undefined)
    throw new Error(
      '[@kestack/std-toolkit/replica] IndexedDB is not available here',
    );
  return found;
};

const everyoneLeads: Leader = (_name, effect) => effect;

const noDoorbell: Doorbell = {
  ring: () => Effect.void,
  listen: () => Stream.never,
};

/** The Store in IndexedDB, shared by this browser's tabs. */
const idb = (options: IdbOptions = {}) => {
  const prefix = options.prefix ?? 'replica:';
  const { navigator, BroadcastChannel } = globalThis as Globals;
  const leader = navigator?.locks
    ? webLocksLeader(navigator.locks)
    : everyoneLeads;
  const doorbell = BroadcastChannel
    ? broadcastChannelDoorbell(BroadcastChannel)
    : noDoorbell;
  return makeStore({
    table: (name) =>
      IDB.make(spaceTable, {
        database: IDB.database({ databaseName: `${prefix}${name}` }),
        // A local copy of the Backend: refetched when a change wipes it.
        mode: 'disposable',
      }).layer,
    names: Effect.tryPromise(() => factory().databases()).pipe(
      Effect.map((databases) =>
        databases.flatMap(({ name }) =>
          name?.startsWith(prefix) ? [name.slice(prefix.length)] : [],
        ),
      ),
    ),
    // Open connections close themselves on the version change a delete
    // raises, so the request completes rather than staying blocked.
    destroy: (name) =>
      Effect.callback<void, unknown>((resume) => {
        const request = factory().deleteDatabase(`${prefix}${name}`);
        request.onsuccess = () => resume(Effect.void);
        request.onerror = () => resume(Effect.fail(request.error));
      }),
    leader: (name, effect) => leader(`${prefix}${name}`, effect),
    doorbell: {
      ring: (topic) => doorbell.ring(`${prefix}${topic}`),
      listen: (topic, initial) => doorbell.listen(`${prefix}${topic}`, initial),
    },
  });
};

export const Store = { idb };
