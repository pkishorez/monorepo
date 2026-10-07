import { Effect, type Layer, Schema } from 'effect';
import { type SignIn, signIn } from '@kstackz/auth-toolkit/client';
import type { StdTableService, TableDefinition } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { Sync, type SyncStore } from '@kstackz/std-toolkit/sync';

/** Where an app's Backend runs, and its Users sign in: in the cloud, or on
 * this device, in the app itself. */
export const Backend = Schema.Literals(['cloud', 'device']);
export type Backend = typeof Backend.Type;

// What the Backends were called before, as a device may still keep them.
const FORMER: Readonly<Record<string, Backend>> = {
  remote: 'cloud',
  local: 'device',
};

/** The Backend `name` names, by its name or its former one (`remote`,
 * `local`); null for anything else. */
export const backendNamed = (
  name: string | null | undefined,
): Backend | null =>
  name === 'cloud' || name === 'device'
    ? name
    : name == null
      ? null
      : (FORMER[name] ?? null);

/** A table as a Host needs it to keep it. */
export type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  'logicalName' | 'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

/** What one tab tells the device's other tabs: look again. `quiet` are
 * accounts it signed out itself, so they are not reported lost there. */
export type TabMessage = { readonly quiet: ReadonlyArray<string> };

/** Where a Host keeps things: a table adapter and a Sync adapter for the
 * same place, such as IndexedDB in a browser or SQLite on a phone. */
export interface Storage {
  /** One table, kept in one of this device's databases, by name. */
  readonly table: <Name extends string>(
    table: TableSource<Name>,
    database: string,
  ) => Layer.Layer<StdTableService<Name>>;
  /** The Sync adapter here, where what a Std Sync keeps outlives the app so
   * it opens offline, and every Std Sync kept on this device, by name. */
  readonly sync: SyncStore & {
    readonly list: () => Promise<ReadonlyArray<{ readonly name: string }>>;
    readonly remove: (name: string) => Promise<void>;
  };
}

/**
 * Everything the Platform Toolkit needs of where an app runs, as a Platform
 * gives it: its Storage, its cloud address and Sign-in, its lifecycle, and
 * its other tabs if it has any. An app never meets it.
 */
export interface Host {
  readonly storage: Storage;
  /** The cloud Backend: where its APIs answer, and, for an app with auth,
   * how a user signs in to it and the sign-in service's own page for
   * managing accounts. */
  readonly cloud: {
    /** What an API's path is resolved against. */
    readonly url: string;
    readonly signIn?: Layer.Layer<SignIn>;
    readonly manageAccounts?: () => Promise<void>;
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
 * A Host kept in memory, with no network events and no other tabs: for
 * tests, and for running an app where nothing outlives the process. Its
 * cloud Sign-in signs nobody in unless `signIn` is given.
 */
export const memoryHost = (
  options: {
    readonly online?: () => boolean;
    readonly signIn?: Layer.Layer<SignIn>;
    readonly url?: string;
    readonly launchBackend?: Backend | null;
  } = {},
): Host => {
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
      url: options.url ?? 'http://localhost',
      signIn: options.signIn ?? signIn.named({ choose: Effect.succeed(null) }),
      manageAccounts: async () => {},
    },
    lifecycle: {
      online: options.online ?? (() => true),
      onOnlineChange: () => () => {},
      onForeground: () => () => {},
      launchBackend: () => options.launchBackend ?? null,
    },
  };
};
