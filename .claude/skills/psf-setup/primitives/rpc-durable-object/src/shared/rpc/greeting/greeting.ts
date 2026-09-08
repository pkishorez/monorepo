import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

export const Greeting = RpcGroup.make(
  Rpc.make('Hello', { success: Schema.String }),
);
