import { execFile } from 'node:child_process';

import { GitError } from './errors.js';

const maxBuffer = 32 * 1024 * 1024;

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
