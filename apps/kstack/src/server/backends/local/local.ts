import { Layer } from 'effect';
import { resolverLocal } from '@kstackz/auth-toolkit/server/rpc';
import { layerInProcessProtocol } from '@kstackz/rpc-toolkit/rpc/in-process';
import { IDB } from '@kstackz/std-toolkit/db/idb';
import { LedgerApi } from '../../../shared/ledger-api/index.ts';
import { ledgerBackend } from '../../domain/backend/index.ts';
import { ledgerTable } from '../../domain/storage/index.ts';

/**
 * The Local Backend, as a connection: the Ledger API answered in this
 * process, from an IndexedDB database of its own, for whoever a Local Token
 * names. Nothing reaches a server.
 */
export const localConnection = layerInProcessProtocol(LedgerApi).pipe(
  Layer.provide(
    ledgerBackend.pipe(
      Layer.provide([
        IDB.make(ledgerTable, {
          database: IDB.database({ databaseName: 'local-backend' }),
        }).layer,
        resolverLocal,
      ]),
    ),
  ),
);
