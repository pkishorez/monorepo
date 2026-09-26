import { IDB } from '../../../db/idb/index.js';
import { stdSyncName } from '../../domain/identity/index.js';
import { syncStore } from '../../domain/stored-entity/index.js';
import {
  closedTopic,
  noDoorbell,
  noLeadership,
  type StdSyncPlatform,
} from '../contract/index.js';
import {
  broadcastChannelDoorbell,
  ringOnce,
  type BroadcastChannelConstructor,
} from './doorbell.js';
import { webLockLeadership, type BrowserLockManager } from './web-locks.js';

export type BrowserOptions = {
  /** Names the IndexedDB database of a Std Sync. Default: `std-sync:<name>`. */
  readonly databaseName?: (syncName: string) => string;
  /** One tab runs each Session, through Web Locks. Default: on. */
  readonly leadership?: boolean;
  /** Tabs tell each other about new data, through BroadcastChannel. Default: on. */
  readonly doorbell?: boolean;
};

type BrowserGlobals = {
  readonly navigator?: { readonly locks?: BrowserLockManager };
  readonly BroadcastChannel?: BroadcastChannelConstructor;
  readonly indexedDB?: IDBFactory;
};

const globals = () => globalThis as unknown as BrowserGlobals;

const PREFIX = 'std-sync:';
const defaultDatabaseName = (syncName: string) => `${PREFIX}${syncName}`;

/**
 * IndexedDB storage, Web Locks Leadership, and a BroadcastChannel Doorbell.
 * A piece the browser lacks falls back to none.
 */
export const browser = (options: BrowserOptions = {}): StdSyncPlatform => {
  const { navigator, BroadcastChannel } = globals();
  const databaseName = options.databaseName ?? defaultDatabaseName;
  const locks = options.leadership === false ? undefined : navigator?.locks;
  const Channel = options.doorbell === false ? undefined : BroadcastChannel;
  return {
    store: (syncName) =>
      IDB.make(syncStore, {
        database: IDB.database({ databaseName: databaseName(syncName) }),
      }).layer,
    leadership: locks ? webLockLeadership(locks) : noLeadership,
    doorbell: Channel ? broadcastChannelDoorbell(Channel) : noDoorbell,
  };
};

const indexedDB = (): IDBFactory => {
  const factory = globals().indexedDB;
  if (factory === undefined)
    throw new Error('[sync] IndexedDB is not available in this environment');
  return factory;
};

/** Every Std Sync stored in this browser under the default database name. */
export const listStdSyncs = async (): Promise<
  ReadonlyArray<{ readonly name: string; readonly databaseName: string }>
> => {
  const databases = await indexedDB().databases();
  return databases.flatMap(({ name }) =>
    name?.startsWith(PREFIX)
      ? [{ name: name.slice(PREFIX.length), databaseName: name }]
      : [],
  );
};

/**
 * Deletes a Std Sync's stored data. A live Std Sync of that name, in this tab
 * or another, stops and reports `PlatformClosed` first.
 */
export const deleteStdSync = async (
  name: string,
  options: Pick<BrowserOptions, 'databaseName'> = {},
): Promise<void> => {
  const syncName = stdSyncName(name);
  const { BroadcastChannel } = globals();
  if (BroadcastChannel) ringOnce(BroadcastChannel, closedTopic(syncName));
  const databaseName = (options.databaseName ?? defaultDatabaseName)(syncName);
  await new Promise<void>((resolve, reject) => {
    // Open connections close themselves on the version change a delete
    // raises, so the request completes rather than staying blocked.
    const request = indexedDB().deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
