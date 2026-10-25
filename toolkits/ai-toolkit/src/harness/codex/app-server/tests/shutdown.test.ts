import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { shutdown } from '../shutdown.js';

/** Starts a child that ignores SIGTERM, prints its pid, then runs `then`. */
const leader = (then: string) => `
const child = require('node:child_process').spawn(
  process.execPath,
  ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
  { stdio: 'ignore' },
);
console.log(child.pid);
${then}
`;

/** Spawns a leader in a group of its own, as Codex is; returns its child's pid. */
const group = async (then: string) => {
  const child = spawn(process.execPath, ['-e', leader(then)], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });
  const [line] = (await once(child.stdout, 'data')) as [Buffer];
  return { child, inner: Number(line.toString().trim()) };
};

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('shutdown', () => {
  it('kills a group whose leader and child ignore their input ending and SIGTERM', async () => {
    const { child, inner } = await group(
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
    );
    await Effect.runPromise(shutdown(child, 100));
    await vi.waitFor(() => expect(alive(inner)).toBe(false));
    expect(child.signalCode).toBe('SIGKILL');
  });

  it('kills what is left when the leader exits on SIGTERM', async () => {
    const { child, inner } = await group('setInterval(() => {}, 1000);');
    await Effect.runPromise(shutdown(child, 100));
    expect(child.signalCode).toBe('SIGTERM');
    await vi.waitFor(() => expect(alive(inner)).toBe(false));
  });

  it('kills what is left when the leader has already exited', async () => {
    const { child, inner } = await group('process.exit(0);');
    await vi.waitFor(() => expect(child.exitCode).toBe(0));
    expect(alive(inner)).toBe(true);
    await Effect.runPromise(shutdown(child, 100));
    await vi.waitFor(() => expect(alive(inner)).toBe(false));
  });

  it('is done at once for a Codex that exits when its input ends', async () => {
    const child = spawn(
      process.execPath,
      ['-e', "process.stdin.on('end', () => process.exit(0)).resume()"],
      { stdio: ['pipe', 'pipe', 'pipe'], detached: true },
    );
    const started = Date.now();
    await Effect.runPromise(shutdown(child, 5_000));
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
