import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

const HelloRpc = Rpc.make('hello', {
  payload: { name: Schema.String },
  success: Schema.String,
});

export const HelloRpcs = RpcGroup.make(HelloRpc);
