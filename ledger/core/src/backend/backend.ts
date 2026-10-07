import { Layer } from 'effect';
import { authzLayer } from '@kstackz/auth-toolkit/server/rpc';
import { LedgerHandlers } from './handlers/index.ts';

/**
 * The Backend, wherever it runs: the Ledger API's handlers, each call
 * checked for the user who signed it. It needs two services, each with a
 * cloud and a device version: the ledger table (`services/table`) and who a
 * token names (`services/auth`).
 */
export const ledgerBackend = Layer.mergeAll(LedgerHandlers, authzLayer);
