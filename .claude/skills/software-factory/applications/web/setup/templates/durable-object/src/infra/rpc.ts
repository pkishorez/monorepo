import { Effect } from 'effect';
import { DurableRpcWorker } from 'rpc-toolkit/rpc/cloudflare/alchemy/durable-rpc-worker';
import { Greeting } from '../shared/rpc/greeting/index.ts';
import { GreetingHandlers } from '../shared/rpc/greeting-handlers/index.ts';

export default class AppRpc extends DurableRpcWorker<AppRpc>()(
  'AppRpc',
  {
    main: import.meta.filename,
    schema: Greeting,
    objectName: 'AppRpcObject',
    compatibility: { date: '2025-09-02', flags: ['nodejs_compat'] },
  },
  Effect.succeed(GreetingHandlers),
) {}
