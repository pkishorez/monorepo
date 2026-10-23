import { Effect, Stream } from 'effect';
import { IDB } from '../../../db/idb/index.js';
import {
  makeStore,
  spaceTable,
  type Leader,
  type StoreOptions,
} from '../contract/index.js';
import {
  broadcastChannelDoorbell,
  type BroadcastChannelConstructor,
} from './doorbell.js';
import { webLocksLeader, type BrowserLockManager } from './web-locks.js';

/*
 * The Store in IndexedDB, shared by a browser's tabs: one database per
 * Instance, a Web Lock per Instance for its Leader, and a BroadcastChannel
 * for its Doorbell. A browser without one of them goes without: every tab
 * leads, or no tab hears the others.
 */

type Globals = {
  readonly navigator?: { readonly locks?: BrowserLockManager };
  readonly BroadcastChannel?: BroadcastChannelConstructor;
  readonly indexedDB?: IDBFactory;
};

const PREFIX = 'replica:';

const factory = (): IDBFactory => {
  const found = (globalThis as Globals).indexedDB;
  if (found === undefined)
    throw new Error(
      '[@kestack/std-toolkit/replica] IndexedDB is not available here',
    );
  return found;
};

const everyoneLeads: Leader = (_name, effect) => effect;

const names = Effect.tryPromise(() => factory().databases()).pipe(
  Effect.map((databases) =>
    databases.flatMap(({ name }) =>
      name?.startsWith(PREFIX) ? [name.slice(PREFIX.length)] : [],
    ),
  ),
);

// Open connections close themselves on the version change a delete raises,
// so the request completes rather than staying blocked.
const destroy = (name: string) =>
  Effect.callback<void, unknown>((resume) => {
    const request = factory().deleteDatabase(`${PREFIX}${name}`);
    request.onsuccess = () => resume(Effect.void);
    request.onerror = () => resume(Effect.fail(request.error));
  });

/** The Store in IndexedDB, shared by this browser's tabs. */
const idb = (options: StoreOptions = {}) => {
  const { navigator, BroadcastChannel } = globalThis as Globals;
  return makeStore(
    {
      table: (name) =>
        IDB.make(spaceTable, {
          database: IDB.database({ databaseName: `${PREFIX}${name}` }),
        }).layer,
      names,
      destroy,
      leader: navigator?.locks
        ? webLocksLeader(navigator.locks)
        : everyoneLeads,
      doorbell: BroadcastChannel
        ? broadcastChannelDoorbell(BroadcastChannel)
        : { ring: () => Effect.void, listen: () => Stream.never },
    },
    options,
  );
};

export const Store = { idb };
