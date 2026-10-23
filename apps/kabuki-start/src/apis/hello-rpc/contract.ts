import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz } from '@kestack/auth-toolkit';
import { ownerOnly } from '../access/index.ts';

/*
 * What the RPC Worker answers, shared by the Worker and the browser's
 * client: one call per level of access, `Public` for anyone,
 * `Authenticated` for any signed-in Account, `Authorized` for the owner.
 */

export const HelloRpcs = RpcGroup.make(
  Rpc.make('Public', { success: Schema.String }),
  Rpc.make('Authenticated', { success: Schema.String }).pipe(Authz.required),
  Rpc.make('Authorized', { success: Schema.String }).pipe(ownerOnly),
);
