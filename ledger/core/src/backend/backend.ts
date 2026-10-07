import { Layer } from 'effect';
import { authz } from '@kstackz/auth-toolkit/server';
import { LedgerHandlers } from './handlers/index.ts';

/**
 * The Backend, wherever it runs: the Ledger API's handlers, each call
 * checked for the user who signed it. It needs two services, each with a
 * cloud and a device version: the ledger table (`services/table`) and who a
 * token names (auth-toolkit's `authz.cloud` or `authz.device`).
 */
export const ledgerBackend = Layer.mergeAll(LedgerHandlers, authz.layer);
