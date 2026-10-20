import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Effect } from 'effect';

/*
 * A command the run performs, its output read line by line as it comes.
 * Each command runs in a process group of its own, so an interrupted run
 * stops everything the command started.
 */

export class CommandFailed extends Error {}

export const runCommand = (options: {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** Each line it writes, to stdout or stderr. */
  readonly onLine: (line: string) => void;
  /** What a failure says, before its exit code. */
  readonly failure: string;
  /** Run through `sh -c` (a setup command the project gave). */
  readonly shell?: boolean;
}) =>
  Effect.callback<void, CommandFailed>((resume) => {
    const child = spawn(options.command, options.args as Array<string>, {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (const stream of [child.stdout, child.stderr])
      createInterface({ input: stream }).on('line', options.onLine);
    child.on('error', (error) =>
      resume(
        Effect.fail(new CommandFailed(`${options.failure}: ${error.message}`)),
      ),
    );
    child.on('close', (code, signal) =>
      resume(
        code === 0
          ? Effect.void
          : Effect.fail(
              new CommandFailed(
                `${options.failure} (${signal ?? `exit code ${code}`}).`,
              ),
            ),
      ),
    );
    return Effect.sync(() => {
      if (child.exitCode === null && child.pid !== undefined)
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          // Gone already.
        }
    });
  });
