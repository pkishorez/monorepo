import { Layer } from 'effect';
import { resolverLocal } from '@kstackz/auth-toolkit/server/rpc';
import { layerInProcessProtocol } from '@kstackz/rpc-toolkit/rpc/in-process';
import type { StdTableService } from '@kstackz/std-toolkit/db';
import { LedgerApi } from '../../../shared/ledger-api/index.ts';
import { ledgerBackend } from '../../domain/backend/index.ts';
import type { ledgerTable } from '../../domain/storage/index.ts';

/**
 * The Local Backend, as a connection: the Ledger API answered in this
 * process, from `table`, a database of its own on this device, for whoever a
 * Local Token names. Nothing reaches a server.
 */
export const localConnection = (
  table: Layer.Layer<StdTableService<typeof ledgerTable.logicalName>>,
) =>
  layerInProcessProtocol(LedgerApi).pipe(
    Layer.provide(ledgerBackend.pipe(Layer.provide([table, resolverLocal]))),
  );
