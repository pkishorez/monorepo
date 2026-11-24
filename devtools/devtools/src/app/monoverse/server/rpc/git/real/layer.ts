import { GitRpc } from '../contract/index.js';
import { getBranches, getChanges, getFileDiff } from './changes.js';
import { readRootFile } from './read-file.js';

/** Fulfils the git RPC, asking Git and reading roots through Snapshots. */
export const GitRpcLive = GitRpc.toLayer({
  GetBranches: ({ root }) => getBranches(root),
  GetChanges: ({ root, branch, base }) => getChanges(root, branch, base),
  GetFileDiff: ({ root, branch, base, path }) =>
    getFileDiff(root, branch, base, path),
  ReadFile: ({ root, branch, path }) => readRootFile(root, branch, path),
});
