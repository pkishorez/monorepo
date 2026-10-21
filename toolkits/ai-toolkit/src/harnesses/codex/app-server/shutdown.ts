import type { ChildProcess } from 'node:child_process';
import { Effect } from 'effect';

/** How long Codex may take to exit at each step before the next. */
const EXIT_GRACE_MS = 5_000;

/**
 * Sends a signal to the child's whole process group, spawned `detached`:
 * the npm launcher and the Codex binary behind it, which a signal to the
 * launcher alone would leave running if it is SIGKILL.
 */
const signal = (child: ChildProcess, name: NodeJS.Signals) => {
  try {
    if (child.pid !== undefined) process.kill(-child.pid, name);
  } catch {
    // The group has already exited.
    child.kill(name);
  }
};

/**
 * Stops Codex: ends its input, so it exits on its own and stops the
 * commands it started; then SIGTERM, then SIGKILL, each after a grace.
 * Done once it has exited.
 */
export const shutdown = (child: ChildProcess, graceMs = EXIT_GRACE_MS) =>
  Effect.callback<void>((resume) => {
    if (child.exitCode !== null || child.signalCode !== null)
      return resume(Effect.void);
    const term = setTimeout(() => signal(child, 'SIGTERM'), graceMs);
    const kill = setTimeout(() => signal(child, 'SIGKILL'), graceMs * 2);
    child.once('exit', () => {
      clearTimeout(term);
      clearTimeout(kill);
      resume(Effect.void);
    });
    child.stdin?.end();
  });
