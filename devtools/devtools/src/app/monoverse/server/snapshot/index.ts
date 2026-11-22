// A Project folder at a branch: the files git knows there and their
// contents, from a worktree on disk or from git at a commit.
export { openSnapshot, toGitUnavailable } from './open.js';
export { diskSnapshot } from './on-disk.js';
export { gitSnapshot } from './from-git.js';
export { existingRoot } from './root.js';
export { listKnownFiles } from './known-files.js';
export { joinPath, readText } from './snapshot.js';
export type { Snapshot } from './snapshot.js';
