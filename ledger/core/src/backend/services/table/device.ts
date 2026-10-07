import { Effect, Layer } from 'effect';
import { AppPlatform } from '@kstackz/auth-toolkit/app';
import { ledgerTable } from './table.ts';

/** The ledger table on this device, in a database of its own (named
 * `local-backend` from before the Backends were renamed, so what it holds
 * stays). */
export const tableDevice = Layer.unwrap(
  Effect.map(AppPlatform, (platform) =>
    platform.table(ledgerTable, 'local-backend'),
  ),
);
