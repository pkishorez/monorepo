import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { FolderEntry, GitHubError, Repository } from '../../github/index.ts';

/**
 * The repositories the caller's GitHub connections reach. `list` covers
 * every connection, at once and again whenever a connection or its
 * repository access changes; `folders` reads one folder of one repository
 * at its default branch; `projectFolders` finds every folder of one
 * repository, at its default branch, that holds an `alchemy.run.ts`: where
 * a project can be.
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
  Rpc.make('projectFolders', {
    payload: {
      connectionId: Schema.String,
      /** `owner/name`. */
      repo: Schema.String,
    },
    /** Each folder holding an `alchemy.run.ts`, `.` for the root, root first. */
    success: Schema.Array(Schema.String),
    error: GitHubError,
  }),
).prefix('Repositories.');
