import { Schema } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

export const Greeting = RpcGroup.make(
  Rpc.make('Hello', { success: Schema.String }).pipe(Authz.guard()),
);
