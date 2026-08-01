import * as Schema from 'effect/Schema';
import { Rpc, RpcGroup, RpcSerialization } from 'effect/unstable/rpc';

export const CodeRpcSerialization = RpcSerialization.layerJson;

export class CodeRpcs extends RpcGroup.make(
  Rpc.make('hello', {
    payload: { name: Schema.String },
    success: Schema.String,
  }),
) {}
