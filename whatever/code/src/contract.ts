import * as Schema from 'effect/Schema';
import { Rpc, RpcGroup, RpcSerialization } from 'effect/unstable/rpc';

/** Shared by the Durable Object server and the browser client. */
export const ApiRpcSerializationLayer = RpcSerialization.layerJson;

export class ApiRpcs extends RpcGroup.make(
  Rpc.make('hello', { success: Schema.String }),
) {}
