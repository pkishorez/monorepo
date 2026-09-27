import { execFileSync } from 'node:child_process';
import type { ResolvedPwaConfig } from '../../shared/config/index.js';

export interface BuildVersion {
  readonly commit: string | null;
  readonly builtAt: string;
}

// Any failure (no git, not a checkout, a hung call) means: no commit.
const git = (root: string, args: ReadonlyArray<string>): string | null => {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
};

/** `abc1234`, or `abc1234-dirty` when tracked files have uncommitted changes. */
const gitCommit = (root: string): string | null => {
  const sha = git(root, ['rev-parse', '--short', 'HEAD']);
  if (!sha) return null;
  const changes = git(root, ['status', '--porcelain', '--untracked-files=no']);
  return changes ? `${sha}-dirty` : sha;
};

/**
 * The build's commit and time, read once when the plugin starts. Explicit
 * `version` options win. Neither feeds the Build ID, which stays a hash of
 * the Precache and worker config, so a rebuild of the same code is no update.
 */
export const resolveBuildVersion = (
  config: ResolvedPwaConfig,
  root: string,
  now: Date = new Date(),
): BuildVersion => ({
  commit: config.version.commit ?? gitCommit(root),
  builtAt: config.version.builtAt ?? now.toISOString(),
});
