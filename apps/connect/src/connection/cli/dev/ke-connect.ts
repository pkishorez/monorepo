import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Duration, Effect } from 'effect';
import { type DevAuth, nodeFlags } from './auth.js';

/*
 * The `ke-connect` this checkout built, run as a process of its own, as a
 * user runs it: `serve` for the branch's Connection, `remove` for one whose
 * branch is gone. Each runs with the Node flags of how its Connection signs
 * in, and its output goes where this process's goes.
 */

const KILL_AFTER = Duration.seconds(10);

/** How long `remove` may take, a Cloud Connect that does not answer included. */
const REMOVING = Duration.minutes(1);

const exitOf = (child: ChildProcess) =>
  new Promise<number | null>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null)
      resolve(child.exitCode);
    else child.once('exit', (code) => resolve(code));
  });

/** Stops `child`: SIGTERM, then SIGKILL after 10 s. */
const stop = (child: ChildProcess) =>
  Effect.promise(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    const killer = setTimeout(
      () => child.kill('SIGKILL'),
      Duration.toMillis(KILL_AFTER),
    );
    await exitOf(child);
    clearTimeout(killer);
  });

/** `ke-connect <args>` from `root` (apps/connect), signing in as `auth` says. */
const keConnect = (root: string, auth: DevAuth, args: ReadonlyArray<string>) =>
  spawn(
    process.execPath,
    [...nodeFlags(auth), join(root, 'bin', 'ke-connect.mjs'), ...args],
    { cwd: root, stdio: 'inherit', env: process.env },
  );

/** A port on 127.0.0.1 that is free now. */
export const freePort = Effect.promise(
  () =>
    new Promise<number>((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        server.close(() => resolve(port));
      });
    }),
);

export interface Serving {
  readonly root: string;
  readonly auth: DevAuth;
  readonly name: string;
  readonly cloud: string;
  readonly port: number;
  /** Other origins a page may call from. */
  readonly origins: ReadonlyArray<string>;
}

/**
 * `ke-connect serve` of `options.name` for as long as the Scope, stopped
 * with it: an Effect that ends with its exit code once it exits on its own.
 */
export const serving = (options: Serving) =>
  Effect.map(
    Effect.acquireRelease(
      Effect.sync(() =>
        keConnect(options.root, options.auth, [
          'serve',
          options.name,
          '--cloud',
          options.cloud,
          '--port',
          String(options.port),
          ...options.origins.flatMap((origin) => ['--origin', origin]),
        ]),
      ),
      stop,
    ),
    (child) => Effect.promise(() => exitOf(child)),
  );

/** `ke-connect remove <name>`, until it exits or a minute passes: whether it removed it. */
export const removing = (root: string, auth: DevAuth, name: string) =>
  Effect.acquireUseRelease(
    Effect.sync(() => keConnect(root, auth, ['remove', name])),
    (child) => Effect.promise(() => exitOf(child)),
    stop,
  ).pipe(
    Effect.map((code) => code === 0),
    Effect.timeoutOrElse({
      duration: REMOVING,
      orElse: () => Effect.succeed(false),
    }),
  );
