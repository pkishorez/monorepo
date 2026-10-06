import { Context, type Effect, type Layer } from 'effect';
import type { Auth } from '@kstackz/auth-toolkit/clients/auth';
import type { StdTableService, TableDefinition } from '@kstackz/std-toolkit/db';
import type { StdSyncPlatform } from '@kstackz/std-toolkit/sync';
import type { User } from '../domain/session/index.ts';
import type { Backend } from '../domain/settings/index.ts';

/** The databases this device keeps tables in: its own (Settings and the
 * Local Backend's Users), and the Local Backend's money. */
export type DeviceDatabase = 'device' | 'local-backend';

/** A table as the platform needs it to keep it. */
export type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  'logicalName' | 'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

/**
 * Everything Ledger needs from the platform it runs on, handed in by each
 * app as one Layer. Core never reaches the platform any other way.
 */
export class LedgerPlatform extends Context.Service<
  LedgerPlatform,
  {
    /** Where this device keeps things. */
    readonly storage: {
      /** One table, kept in one of this device's databases. */
      readonly table: <Name extends string>(
        table: TableSource<Name>,
        database: DeviceDatabase,
      ) => Layer.Layer<StdTableService<Name>>;
      /** Where a Remote Session keeps its User's copy, to open offline. */
      readonly copies: StdSyncPlatform;
      /** Every copy kept on this device, by name. */
      readonly listCopies: () => Promise<
        ReadonlyArray<{ readonly name: string }>
      >;
      readonly deleteCopy: (name: string) => Promise<void>;
    };
    /** The User last opened on the Remote Backend, to open offline. */
    readonly lastUser: {
      readonly get: Effect.Effect<User | null>;
      readonly set: (user: User | null) => Effect.Effect<void>;
    };
    /** The Remote Backend: how a User signs in to it, and where its
     * Ledger API answers. */
    readonly remote: {
      readonly auth: Layer.Layer<Auth>;
      readonly ledgerUrl: string;
      /** Opens the sign-in service's own page, where a User manages the
       * Google accounts signed in there and the apps they let in. */
      readonly manageAccounts: () => Promise<void>;
    };
    /** When the app is online and in view. */
    readonly lifecycle: {
      readonly online: () => boolean;
      /** Calls `changed` whenever the network comes or goes. */
      readonly onOnlineChange: (changed: () => void) => () => void;
      /** Calls `shown` whenever the app comes back into view. */
      readonly onForeground: (shown: () => void) => () => void;
      /** The Backend the app was launched asked to run on, if any, as
       * `?backend=local` does on the web. Asked once, at start. */
      readonly launchBackend: () => Backend | null;
    };
  }
>()('ledger/Platform') {}
