import { Layer } from 'effect';
import { authz } from '@kstackz/auth-toolkit/server';
import { LedgerHandlers } from './handlers/index.ts';

/**
 * The Backend, wherever it runs: the Ledger API's handlers, each call
 * checked for the user who signed it. It needs these services, each with a
 * version for each place it runs: the ledger table (`services/table`), who
 * a token names (auth-toolkit's `authz.cloud` or `authz.device`), and, for
 * changes as they are made, a Broadcaster (`services/broadcaster`; D1 has
 * none, so its Watch fails).
 */
export const ledgerBackend = Layer.mergeAll(LedgerHandlers, authz.layer);
