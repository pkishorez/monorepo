import { Effect, type Layer } from 'effect';
import type { StdTableService, TableDefinition } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { Sync, type SyncStore } from '@kstackz/std-toolkit/sync';
import type { Backend, SignIn } from '../account/index.js';
import { named } from '../sign-in/named/index.js';

/** A table as a Platform needs it to keep it. */
export type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  'logicalName' | 'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

/** What one tab tells the device's other tabs: look again. `quiet` are
 * accounts it signed out itself, so they are not reported lost there. */
export type TabMessage = { readonly quiet: ReadonlyArray<string> };

/**
 * Everything an app needs of where it runs, as `createApp` takes it: its
 * Storage, its cloud Sign-in and address, its lifecycle, and its other tabs
 * if it has any.
 */
export interface Platform {
  /** Where this device keeps things. */
  readonly storage: {
    /** One table, kept in one of this device's databases, by name. */
    readonly table: <Name extends string>(
      table: TableSource<Name>,
      database: string,
    ) => Layer.Layer<StdTableService<Name>>;
    /** The Sync adapter here, where what a Std Sync keeps outlives the app
     * so it opens offline, and every Std Sync kept on this device, by
     * name. */
    readonly sync: SyncStore & {
      readonly list: () => Promise<ReadonlyArray<{ readonly name: string }>>;
      readonly remove: (name: string) => Promise<void>;
    };
  };
  /** The cloud Backend: how a user signs in to it, where its API answers,
   * and the sign-in service's own page for managing accounts. */
  readonly cloud: {
    readonly signIn: Layer.Layer<SignIn>;
    readonly url: string;
    readonly manageAccounts: () => Promise<void>;
  };
  /** When the app is online and in view. */
  readonly lifecycle: {
    readonly online: () => boolean;
    /** Calls `changed` whenever the network comes or goes. */
    readonly onOnlineChange: (changed: () => void) => () => void;
    /** Calls `shown` whenever the app comes back into view. */
    readonly onForeground: (shown: () => void) => () => void;
    /** The Backend the launch asked for, if any, as `?backend=device` does
     * on the web. Asked once, at start. */
    readonly launchBackend: () => Backend | null;
  };
  /** The device's other tabs, where there can be more than one. */
  readonly tabs?: {
    readonly announce: (message: TabMessage) => void;
    readonly listen: (heard: (message: TabMessage) => void) => () => void;
  };
}

/**
 * A Platform kept in memory, with no network events and no other tabs: for
 * tests, and for running an app where nothing outlives the process. Its
 * cloud Sign-in signs nobody in unless `signIn` is given.
 */
export const memoryPlatform = (
  options: {
    readonly online?: () => boolean;
    readonly signIn?: Layer.Layer<SignIn>;
    readonly url?: string;
  } = {},
): Platform => {
  // One table per database and name, as a real device keeps it.
  const tables = new Map<string, Layer.Layer<never>>();
  const table = <Name extends string>(
    source: TableSource<Name>,
    database: string,
  ): Layer.Layer<StdTableService<Name>> => {
    const key = `${database}/${source.logicalName}`;
    let kept = tables.get(key);
    if (kept === undefined) {
      kept = Memory.make(source as TableDefinition<Name>).layer as never;
      tables.set(key, kept);
    }
    return kept as Layer.Layer<StdTableService<Name>>;
  };
  return {
    storage: {
      table,
      // Nothing outlives the process, so there is nothing to list.
      sync: { ...Sync.memory(), list: async () => [], remove: async () => {} },
    },
    cloud: {
      signIn: options.signIn ?? named({ choose: Effect.succeed(null) }),
      url: options.url ?? 'http://localhost',
      manageAccounts: async () => {},
    },
    lifecycle: {
      online: options.online ?? (() => true),
      onOnlineChange: () => () => {},
      onForeground: () => () => {},
      launchBackend: () => null,
    },
  };
};
