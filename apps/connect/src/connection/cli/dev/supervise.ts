import { type ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';
import { Effect } from 'effect';
import { names } from '@kestack/cli-platform/files';
import { type DevAuth, authOf, connectionName } from './auth.js';
import { worktreeSlugs } from './branch.js';
import { removeGone } from './gone.js';
import { freePort, removing, serving } from './ke-connect.js';
import { live } from './leases.js';
import {
  type ConnectRecord,
  markStopping,
  removeRecord,
  stopUnlessLeased,
  writeRecord,
} from './record.js';

/*
 * Running this branch's Connect: its Cloud Connect under `alchemy dev`
 * behind Portless, then the branch's own Connection, `ke-connect serve` as
 * a process of its own, against it, running the code Plugin this checkout
 * built, ready once its router answers `/health` and `connect.json` says
 * so. Meanwhile the development Connections of branches with no checkout
 * any more are removed. A shared Connect stops 3 s after its last lease is
 * gone, unless an App leased it as it decided, watching from the moment it
 * starts, so an App that gives up while Cloud Connect never answers does
 * not leave it running; a foreground one stops on Ctrl-C.
 */

export interface Supervised {
  /** apps/connect, where `alchemy.run.ts` is. */
  readonly root: string;
  /** This branch's dev folder. */
  readonly dir: string;
  readonly slug: string;
  readonly cloud: string;
  readonly mode: ConnectRecord['mode'];
  readonly version: string;
  readonly auth: DevAuth;
}

const RETRY_MS = 500;
const POLL_MS = 1_000;
const GRACE_MS = 3_000;
const KILL_AFTER_MS = 10_000;
/** Refusals of the lock in a row, with no lease left, before it stops without it. */
const LOCK_TRIES = 3;

const exitOf = (child: ChildProcess) =>
  new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) resolve();
    else child.once('exit', () => resolve());
  });

/** `portless run alchemy dev` in `root`, stopped with SIGINT, then SIGKILL after 10 s. */
const alchemyDev = (root: string) =>
  Effect.acquireRelease(
    Effect.sync(() =>
      spawn('portless', ['run', '--force', 'alchemy', 'dev'], {
        cwd: root,
        stdio: 'inherit',
      }),
    ),
    (child) =>
      Effect.promise(async () => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        child.kill('SIGINT');
        const killer = setTimeout(() => child.kill('SIGKILL'), KILL_AFTER_MS);
        await exitOf(child);
        clearTimeout(killer);
      }),
  );

/** Fails once `child` exits. */
const exited = (child: ChildProcess) =>
  Effect.promise(() => exitOf(child)).pipe(
    Effect.flatMap(() =>
      Effect.fail(
        new Error(
          `alchemy dev exited with ${child.exitCode ?? child.signalCode}`,
        ),
      ),
    ),
  );

/** Waits until `GET <base>/<path>` answers 200. */
const answering = (base: string, path: string) =>
  Effect.promise(async (signal) => {
    while (!signal.aborted) {
      try {
        const response = await fetch(`${base.replace(/\/+$/, '')}/${path}`);
        await response.body?.cancel();
        if (response.ok) return;
      } catch {
        // Not up yet.
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
    }
  });

/** Waits until the Connection's router on `port` answers `GET /health`. */
const healthy = (port: number) =>
  answering(`http://127.0.0.1:${port}`, 'health');

/** Ends once no live lease has been left in `dir` for 3 s, its record then saying it is stopping. */
const unleased = (dir: string) =>
  Effect.promise(async (signal) => {
    let since = Date.now();
    let refused = 0;
    while (!signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      if (live(dir).length > 0) {
        since = Date.now();
        refused = 0;
      } else if (Date.now() - since >= GRACE_MS) {
        try {
          if (await stopUnlessLeased(dir)) return;
          refused = 0;
        } catch (error) {
          // A lock it cannot take, such as one another program holds the
          // port of, keeps it running to decide again; one refused this
          // many times running stops it anyway, with no lease left.
          refused += 1;
          process.stderr.write(
            `Connect could not take its lock to stop (${refused}/${LOCK_TRIES}): ${error instanceof Error ? error.message : String(error)}\n`,
          );
          if (refused >= LOCK_TRIES && live(dir).length === 0) {
            markStopping(dir);
            return;
          }
        }
        since = Date.now();
      }
    }
  });

/** Names the Apps still holding a lease, as a foreground Connect stops. */
const warnLeft = (dir: string) =>
  Effect.suspend(() => {
    const left = live(dir).filter((lease) => lease.pid !== process.pid);
    return left.length === 0
      ? Effect.void
      : Effect.logWarning(
          `Stopping Connect while ${left.map((lease) => `${lease.app} (${lease.pid})`).join(', ')} still use it`,
        );
  });

/** Removes the development Connections of branches with no checkout, beside whatever runs. */
const removeGoneConnections = (root: string) =>
  removeGone({
    slugs: Effect.tryPromise(() => worktreeSlugs(root)),
    names: () => names('connect'),
    remove: (name) => removing(root, authOf(name), name),
  }).pipe(Effect.forkScoped);

/** Runs Connect as `options` says, until it stops; `connect.json` goes with it. */
export const supervise = (options: Supervised) =>
  Effect.gen(function* () {
    const { root, dir, slug, cloud, mode, version, auth } = options;
    const startedAt = new Date().toISOString();
    yield* removeGoneConnections(root);
    const alchemy = yield* alchemyDev(root);
    const running = Effect.gen(function* () {
      yield* Effect.log(`Waiting for Cloud Connect at ${cloud}`);
      yield* Effect.raceFirst(answering(cloud, 'auth'), exited(alchemy));
      const name = connectionName(slug, auth);
      const port = yield* freePort;
      const ended = yield* serving({
        root,
        auth,
        name,
        cloud,
        port,
        // A page through a Cloudflare tunnel, which only the Fake signs in.
        origins: auth === 'fake' ? ['https://*.trycloudflare.com'] : [],
        plugins: {
          code: join(root, 'dist', 'plugins', 'code', 'serve', 'main.js'),
        },
      });
      const ready = healthy(port).pipe(
        Effect.andThen(
          Effect.sync(() =>
            writeRecord(dir, {
              pid: process.pid,
              mode,
              cloud,
              auth,
              port,
              connection: name,
              ready: true,
              startedAt,
              version,
            }),
          ),
        ),
        Effect.andThen(Effect.never),
      );
      const code = yield* Effect.raceFirst(ended, ready).pipe(
        Effect.raceFirst(exited(alchemy)),
      );
      if (code !== 0 && code !== null)
        yield* Effect.logWarning(
          `ke-connect serve ${name} exited with ${code}`,
        );
    }).pipe(Effect.scoped);
    if (mode === 'shared') {
      yield* Effect.raceFirst(running, unleased(dir));
      yield* Effect.log('No App uses Connect any more; stopping it');
    } else yield* running.pipe(Effect.onInterrupt(() => warnLeft(dir)));
  }).pipe(
    Effect.scoped,
    Effect.ensuring(Effect.sync(() => removeRecord(options.dir, process.pid))),
  );
