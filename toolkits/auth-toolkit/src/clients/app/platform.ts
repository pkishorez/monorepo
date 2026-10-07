import { Context, type Layer } from 'effect';
import type { StdTableService, TableDefinition } from '@kstackz/std-toolkit/db';
import type { StdSyncPlatform } from '@kstackz/std-toolkit/sync';
import type { Auth } from '../auth/index.js';
import type { GatePlatform } from '../gate/index.js';

/** A table as a platform needs it to keep it. */
export type TableSource<Name extends string> = Pick<
  TableDefinition<Name>,
  'logicalName' | 'primary' | 'localSecondaryIndexes' | 'globalSecondaryIndexes'
>;

/**
 * Everything an app needs of the platform it runs on, as web-toolkit's
 * `webPlatform` and expo-toolkit's `expoPlatform` give it. An app's stores
 * ask for it as a service.
 */
export class AppPlatform extends Context.Service<
  AppPlatform,
  {
    /** One table, kept in one of this device's databases, by name. */
    readonly table: <Name extends string>(
      table: TableSource<Name>,
      database: string,
    ) => Layer.Layer<StdTableService<Name>>;
    /** Std Sync's platform here, where what a sync keeps outlives the app
     * so it opens offline, and every sync kept on this device, by name. */
    readonly sync: StdSyncPlatform & {
      readonly list: () => Promise<ReadonlyArray<{ readonly name: string }>>;
      readonly remove: (name: string) => Promise<void>;
    };
    /** The cloud Backend: how a user signs in to it, where its API answers,
     * and the sign-in service's own page for managing accounts. */
    readonly cloud: {
      readonly auth: Layer.Layer<Auth>;
      readonly url: string;
      readonly manageAccounts: () => Promise<void>;
    };
    /** What the Gate needs: the device's memory, when it is online and in
     * view, and its other tabs. */
    readonly gate: GatePlatform;
  }
>()('@kstackz/auth-toolkit/AppPlatform') {}
