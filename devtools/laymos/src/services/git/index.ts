// Service tag callers yield to ask git what a Base ref changed.
export { Git } from './git.js';
// Live layer running git as a child process in the Project's folder.
export { GitLive } from './git.js';
// Tagged error callers pattern-match on when git is absent or fails.
export { GitError } from './errors.js';
