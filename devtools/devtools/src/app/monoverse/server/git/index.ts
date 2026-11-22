// Running git as a child process in one folder, and where a Project folder
// and each of its branches sit in the repository and its worktrees.
export { GitError, requireGit, runGit, splitNul } from './run-git.js';
export {
  listBranches,
  locateRepository,
  parseWorktreeList,
  placeBranch,
  worktreeFolder,
} from './repository.js';
export type { Checkout, Placement, Repository } from './repository.js';
