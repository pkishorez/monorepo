import { execFile } from 'node:child_process';

import { GitError } from '../contract/index.js';

const maxBuffer = 32 * 1024 * 1024;

/** Runs git in `baseDir`, never throwing: `ok` says whether it succeeded. */
export function runGit(
  baseDir: string,
  args: readonly string[],
): Promise<{
  readonly stdout: string;
  readonly stderr: string;
  readonly ok: boolean;
}> {
  return new Promise((resolve) => {
    execFile(
      'git',
      [...args],
      { cwd: baseDir, maxBuffer, encoding: 'utf8' },
      (error, stdout, stderr) =>
        resolve({ stdout, stderr, ok: error === null }),
    );
  });
}

/** Runs git in `baseDir` and gives its output, or throws a GitError for `reason`. */
export async function requireGit(
  baseDir: string,
  args: readonly string[],
  reason: GitError['reason'],
): Promise<string> {
  const { stdout, stderr, ok } = await runGit(baseDir, args);
  if (!ok) {
    throw new GitError({
      reason,
      baseDir,
      cause: `git ${args.join(' ')}: ${stderr.trim()}`,
    });
  }
  return stdout;
}

export function splitNul(stdout: string): string[] {
  return stdout.split('\0').filter((field) => field !== '');
}
