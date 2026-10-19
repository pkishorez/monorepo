import { Rpc, RpcGroup } from 'effect/rpc';
import { Member } from '../../member/index.ts';

/**
 * Who the caller is in their User Space. `me` answers once; `watch` answers
 * at once and again whenever the member changes, the smallest proof that a
 * change reaches every open tab.
 */
export const Session = RpcGroup.make(
  Rpc.make('me', { success: Member }),
  Rpc.make('watch', { success: Member, stream: true }),
).prefix('Session.');
