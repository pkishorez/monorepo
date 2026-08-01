import { RpcGroup } from 'effect/unstable/rpc';
import { InterruptRunRpc } from './interrupt-run.js';
import { StartRunRpc } from './start-run.js';
import { StartThreadRpc } from './start-thread.js';

export { CodeRpcError } from './code-rpc-error.js';

export const CodeRpcs = RpcGroup.make(
  StartThreadRpc,
  StartRunRpc,
  InterruptRunRpc,
);
