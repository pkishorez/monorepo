import { Layer } from 'effect';
import { authzLayer } from '@kstackz/auth-toolkit/server/rpc';
import { LedgerHandlers } from '../ledger/index.ts';

/**
 * The Backend, wherever it runs: the Ledger API's handlers, each call
 * checked for the User who signed it. It needs the ledger table, on any
 * adapter, and a Resolver to say who a token names.
 */
export const ledgerBackend = Layer.mergeAll(LedgerHandlers, authzLayer);
