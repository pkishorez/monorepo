import { execFile } from 'node:child_process';

/** How long `git init` may take. */
const GIT_TIMEOUT_MS = 10_000;

/** Runs `git init` in `path`; why it failed, or null when it ran. */
export const gitInit = (path: string) =>
  new Promise<string | null>((resolve) => {
    execFile(
      'git',
      ['init'],
      { cwd: path, timeout: GIT_TIMEOUT_MS },
      (error, _stdout, stderr) =>
        resolve(
          error === null
            ? null
            : stderr.trim() || error.message || 'git failed',
        ),
    );
  });
