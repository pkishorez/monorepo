import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { GitHubConnection, GitHubError, ReturnTo } from '../../github/index.ts';

/**
 * The caller's GitHub connections. `list` answers at once and again on
 * every change, in every tab. `installUrl` is where the browser goes to
 * install the App on one more account, carrying a one-time `state` that
 * ties the return to this member; GitHub sends them back to
 * `/github/connected`, which lands on `returnTo`. `remove` forgets a
 * connection in Console; the App stays installed on GitHub.
 */
export const Connections = RpcGroup.make(
  Rpc.make('list', { success: Schema.Array(GitHubConnection), stream: true }),
  Rpc.make('installUrl', {
    payload: { returnTo: ReturnTo },
    success: Schema.String,
  }),
  Rpc.make('remove', {
    payload: { connectionId: Schema.String },
    error: GitHubError,
  }),
).prefix('Connections.');
