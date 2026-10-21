import type { ChildProcess } from 'node:child_process';
import { Effect } from 'effect';

/** How long Codex may take to exit at each step before the next. */
const EXIT_GRACE_MS = 5_000;

/** How often the process group is checked for anything still running. */
const POLL_MS = 50;

/**
 * Whether anything in the process group is still running. Codex is spawned
 * `detached`, leading a group of its own: the npm launcher, the Codex
 * binary behind it, and whatever they started that stayed in it.
 */
const alive = (group: number) => {
  try {
    process.kill(-group, 0);
    return true;
  } catch {
    return false;
  }
};

const signal = (group: number, name: NodeJS.Signals) => {
  try {
    process.kill(-group, name);
  } catch {
    // The group is gone.
  }
};

/** Waits until the group is gone; false when it is not within `ms`. */
const gone = (group: number, ms: number) =>
  Effect.gen(function* () {
    const until = Date.now() + ms;
    while (alive(group)) {
      if (Date.now() >= until) return false;
      yield* Effect.sleep(POLL_MS);
    }
    return true;
  });

/**
 * Stops Codex and its process group: ends its input, so Codex exits on its
 * own and stops the commands it started; whatever of the group is left
 * after a grace gets SIGTERM, and after another, SIGKILL. The group counts,
 * not its leader: the launcher may exit while the binary behind it lives.
 *
 * A server that dies without running this leaves the same input ending, so
 * Codex still exits; what it started and would not stop is left running.
 */
export const shutdown = (child: ChildProcess, graceMs = EXIT_GRACE_MS) =>
  Effect.gen(function* () {
    const group = child.pid;
    child.stdin?.end();
    if (group === undefined) return;
    if (yield* gone(group, graceMs)) return;
    signal(group, 'SIGTERM');
    if (yield* gone(group, graceMs)) return;
    signal(group, 'SIGKILL');
    yield* gone(group, graceMs);
  });
