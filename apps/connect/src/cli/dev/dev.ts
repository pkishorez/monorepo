import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  closeSync,
} from 'node:fs';
import { constants } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeRuntime } from '@effect/platform-node';
import { resolvePaths } from '../../machine/index.js';
import { branchOf } from './branch.js';
import { pidAlive, take, live } from './leases.js';
import { withLock } from './lock.js';
import {
  type ConnectRecord,
  readRecord,
  standingOf,
  writeRecord,
} from './record.js';
import { supervise } from './supervise.js';
import { follow, proxyUp, sizeOf } from './terminal.js';

export { branchOf };

/*
 * Connect in development, one per branch, shared by every App run on it.
 * `withConnect` is an App's `pnpm dev`: it makes sure the branch's Connect
 * runs (`ensureConnect` starts the detached supervisor when it does not,
 * and takes a lease either way), then runs the App against its Cloud
 * Connect. `runConnectDev` is Connect's own `pnpm dev` in the foreground,
 * attaching instead when one already runs, and, in shared mode, the
 * supervisor itself, which stops once the last lease is gone.
 *
 * Everything lives in the branch's dev folder: `lock`, `connect.json`,
 * `leases/` and the supervisor's `connect.log`.
 */

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
const WAIT_MS = 500;

/** apps/connect, from dist/cli/dev or src/cli/dev. */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const version = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    readonly version: string;
  }
).version;

const PROXY_DOWN =
  "Portless's proxy is not running, and Connect starts in the background where it cannot start it. Run `portless proxy start`, then `pnpm dev` again.";

/** The branch at `cwd`, and its dev folder, made if missing. */
const devOf = async (cwd: string) => {
  const branch = await branchOf(cwd);
  const dir = resolvePaths({ branch: branch.slug }).dev;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return { ...branch, dir, log: join(dir, 'connect.log') };
};

/** What `connect.json` says before its Connect listens. */
const starting = (
  pid: number,
  cloud: string,
  mode: ConnectRecord['mode'],
): ConnectRecord => ({
  pid,
  mode,
  cloud,
  port: 0,
  machine: null,
  ready: false,
  startedAt: new Date().toISOString(),
  version,
});

/** Starts the shared supervisor, detached, writing to `log`; its pid. */
const spawnSupervisor = (cwd: string, log: string): number => {
  const fd = openSync(log, 'w', 0o600);
  try {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./supervisor.js', import.meta.url))],
      { cwd, detached: true, stdio: ['ignore', fd, fd], env: process.env },
    );
    if (child.pid === undefined)
      throw new Error(`Could not start Connect's supervisor; see ${log}`);
    child.unref();
    return child.pid;
  } finally {
    closeSync(fd);
  }
};

/** Gives `release` back when the process exits or is signalled, signalling again when no one else listens. */
const bindRelease = (release: () => void) => {
  process.once('exit', release);
  for (const signal of SIGNALS)
    process.once(signal, () => {
      release();
      if (process.listenerCount(signal) === 0)
        process.kill(process.pid, signal);
    });
};

/** Waits until the Connect in `dir` is alive, showing the shared one's log meanwhile; fails if it stops first. */
const waitAlive = async (dir: string, log: string): Promise<ConnectRecord> => {
  let first = await standingOf(readRecord(dir));
  if (first.kind === 'alive') return first.record;
  if (first.kind === 'starting' && first.record.mode === 'foreground')
    process.stdout.write(
      'Waiting for the Connect starting in another terminal (apps/connect pnpm dev)\n',
    );
  const stop =
    first.kind === 'starting' && first.record.mode === 'shared'
      ? follow(log)
      : () => {};
  try {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
      first = await standingOf(readRecord(dir));
      if (first.kind === 'alive') return first.record;
      if (first.kind === 'absent')
        throw new Error(
          `Connect stopped before it was ready; its log is ${log}`,
        );
    }
  } finally {
    stop();
  }
};

/**
 * Makes sure the Connect of the branch at `cwd` runs, starting it detached
 * when it does not, and takes a lease on it for `app`. It resolves once
 * Connect is ready, with its Cloud Connect's URL and the function that gives
 * the lease back (also given back on exit and on SIGINT, SIGTERM, SIGHUP).
 */
export const ensureConnect = async ({
  app,
  cwd = process.cwd(),
}: {
  readonly app: string;
  readonly cwd?: string;
}): Promise<{ readonly cloud: string; readonly release: () => void }> => {
  const { cloud, dir, log } = await devOf(cwd);
  const release = await withLock(dir, async () => {
    const standing = await standingOf(readRecord(dir));
    if (standing.kind === 'absent') {
      if (!(await proxyUp(cloud))) throw new Error(PROXY_DOWN);
      writeRecord(dir, starting(spawnSupervisor(cwd, log), cloud, 'shared'));
    }
    return take(dir, app);
  });
  bindRelease(release);
  try {
    await waitAlive(dir, log);
  } catch (error) {
    release();
    throw error;
  }
  return { cloud, release };
};

/**
 * An App's `pnpm dev`: makes sure the branch's Connect runs, then runs
 * `command args` with `CONNECT_URL` set to its Cloud Connect, and exits
 * with the command's code, giving the lease back. Ctrl-C reaches the
 * command through the terminal; the detached Connect stops on its own once
 * no App holds a lease.
 */
export const withConnect = async ({
  app,
  command,
  args = [],
  cwd = process.cwd(),
}: {
  readonly app: string;
  readonly command: string;
  readonly args?: ReadonlyArray<string>;
  readonly cwd?: string;
}): Promise<never> => {
  let ensured: Awaited<ReturnType<typeof ensureConnect>>;
  try {
    ensured = await ensureConnect({ app, cwd });
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
  const child = spawn(command, [...args], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, CONNECT_URL: ensured.cloud },
  });
  // SIGINT reaches the child through the terminal's process group; the
  // others are passed on, and none ends this process before the child.
  for (const signal of SIGNALS)
    process.on(signal, () => {
      if (signal !== 'SIGINT') child.kill(signal);
    });
  const code = await new Promise<number>((resolve) => {
    child.once('error', (error) => {
      process.stderr.write(`${error.message}\n`);
      resolve(1);
    });
    child.once('exit', (code, signal) =>
      resolve(code ?? 128 + (signal === null ? 0 : constants.signals[signal])),
    );
  });
  ensured.release();
  process.exit(code);
};

/** Follows a running Connect as App `connect` until Ctrl-C, or until it stops. */
const attach = async (dir: string, log: string, record: ConnectRecord) => {
  const release = take(dir, 'connect');
  bindRelease(release);
  process.stdout.write(
    `Attached to this branch's Connect (pid ${record.pid}, ${record.mode}) at ${record.cloud}; Ctrl-C detaches.\n`,
  );
  const stop =
    record.mode === 'shared'
      ? follow(log, record.ready ? sizeOf(log) : 0)
      : () => {};
  while (pidAlive(record.pid))
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  stop();
  release();
  process.stdout.write('Connect stopped.\n');
};

/**
 * Runs this branch's Connect until it stops. In the foreground (Connect's
 * own `pnpm dev`) Ctrl-C stops it, warning about Apps still using it; if
 * one already runs, this attaches to it instead. In shared mode (the
 * detached supervisor) it stops 3 s after the last lease is gone, and exits
 * at once if another Connect already runs. It runs only in the monorepo,
 * where the package has its `alchemy.run.ts`.
 */
export const runConnectDev = async ({
  mode = 'foreground',
}: { readonly mode?: ConnectRecord['mode'] } = {}): Promise<void> => {
  if (!existsSync(join(ROOT, 'alchemy.run.ts')))
    throw new Error('runConnectDev runs only in the monorepo');
  const { slug, cloud, dir, log } = await devOf(ROOT);
  const other = await withLock(dir, async () => {
    const standing = await standingOf(readRecord(dir));
    if (standing.kind !== 'absent' && standing.record.pid !== process.pid)
      return standing.record;
    writeRecord(dir, starting(process.pid, cloud, mode));
    return undefined;
  });
  if (other !== undefined) {
    if (mode === 'foreground') await attach(dir, log, other);
    return;
  }
  if (mode === 'foreground' && live(dir).length > 0)
    process.stdout.write('Apps are waiting on this Connect.\n');
  NodeRuntime.runMain(
    supervise({ root: ROOT, dir, slug, cloud, mode, version }),
  );
};
