import { DurableRpcWorker } from '@monorepo/alchemy-toolkit/unstable/durable-rpc-worker';
import { BankRpcs } from '../../demos/bank/rpc/contract/index.ts';
import { BankDurableObjectHandlers } from '../../demos/bank/rpc/server/durable-object/index.ts';
import { adminConnection, adminKey } from './config.ts';

export default class SqliteDO extends DurableRpcWorker<SqliteDO>()(
  'SqliteDO',
  {
    main: import.meta.filename,
    schema: BankRpcs,
    objectName: 'BankDurableObject',
    transferredFrom: ['Worker', 'BankDo'],
    compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
    init: adminKey,
    connection: adminConnection,
  },
  BankDurableObjectHandlers,
) {}
