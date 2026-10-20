import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { FolderEntry, GitHubError, Repository } from '../../github/index.ts';

/**
 * The repositories the caller's GitHub connections reach. `list` covers
 * every connection, at once and again whenever a connection or its
 * repository access changes; `folders` reads one folder of one repository
 * at its default branch, for picking where a project's `alchemy.run.ts` is.
 */
export const Repositories = RpcGroup.make(
  Rpc.make('list', { success: Schema.Array(Repository), stream: true }),
  Rpc.make('folders', {
    payload: {
      connectionId: Schema.String,
      /** `owner/name`. */
      repo: Schema.String,
      /** From the root, `''` for the root itself. */
      path: Schema.String,
    },
    success: Schema.Array(FolderEntry),
    error: GitHubError,
  }),
).prefix('Repositories.');
