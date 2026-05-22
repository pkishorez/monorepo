import { Rpc, RpcGroup } from '@effect/rpc';
import { HelloMessage } from '../../domain/hello/index.js';

const getHello = Rpc.make('getHello', {
  success: HelloMessage,
});

const streamHello = Rpc.make('streamHello', {
  success: HelloMessage,
  stream: true,
});

export const AppRpcs = RpcGroup.make(getHello, streamHello);
