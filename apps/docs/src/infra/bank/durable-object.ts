import { DurableRpcWorker } from '@monorepo/alchemy-toolkit/unstable/durable-rpc-worker';
import { BankRpcs } from '../../demos/bank/rpc/contract/index.ts';
import { BankDurableObjectHandlers } from '../../demos/bank/rpc/server/durable-object/index.ts';

export default class BankDo extends DurableRpcWorker<BankDo>()(
  'BankDo',
  {
    main: import.meta.filename,
    schema: BankRpcs,
    objectName: 'BankDurableObject',
    transferredFrom: 'Worker',
    compatibility: { date: '2025-07-04', flags: ['nodejs_compat'] },
  },
  BankDurableObjectHandlers,
) {}
