import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { resolve } from 'node:path';
import { Duration, Effect, Schedule } from 'effect';

/*
 * One process at a time works on one cache entry. The lock is a TCP port on
 * 127.0.0.1 worked out from the entry's path: holding it is listening on
 * it. The kernel gives the port back when the process exits, however it
 * exits, so a lock is never left behind and nothing is ever taken over.
 *
 * Why not a file: a lock file, or a Unix socket file, outlives a process
 * that crashed. Telling a stale one from a live one needs a pid that may be
 * reused, or a connect that may race: two processes find it stale, both
 * delete it, and both think they hold it. Listening on a port is one atomic
 * step with no file to go stale. Two entries whose ports collide, or another
 * program on the port, only make one wait for the other; the wait gives up
 * after its timeout.
 */

/*
 * 20000–29999 is below every range the OS hands out for port 0 (macOS and
 * Windows 49152–65535, Linux 32768–60999), so a server listening on port 0
 * is never given a lock's port.
 */
const FIRST_PORT = 20_000;
const PORTS = 10_000;

/** How often a waiting process tries the lock again. */
const RETRY = Duration.millis(100);

/** The port that is the lock of `path`. */
export const lockPort = (path: string) =>
  FIRST_PORT +
  (createHash('sha256').update(resolve(path)).digest().readUInt32BE(0) % PORTS);

/** Listens on `port` if it is free: the server, or undefined when the lock is held. */
const listen = (port: number) =>
  Effect.callback<Server | undefined, Error>((resume) => {
    // Nothing talks to a lock: each connection is closed as it comes, so
    // `close` never waits on one.
    const server = createServer((socket) => socket.destroy());
    server.once('error', (error: NodeJS.ErrnoException) =>
      resume(
        error.code === 'EADDRINUSE'
          ? Effect.succeed(undefined)
          : Effect.fail(error),
      ),
    );
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () =>
      resume(Effect.succeed(server)),
    );
  });

const release = (server: Server) =>
  Effect.callback<void>((resume) => {
    server.close(() => resume(Effect.void));
  });

/** Takes the lock of `path` for the Scope if it is free now: whether it did. */
export const tryLock = (path: string) =>
  Effect.uninterruptible(
    listen(lockPort(path)).pipe(
      Effect.tap((server) =>
        server === undefined
          ? Effect.void
          : Effect.addFinalizer(() => release(server)),
      ),
      Effect.map((server) => server !== undefined),
    ),
  );

/** Takes the lock of `path` for the Scope, waiting while another holds it; fails after `timeout`. */
export const lock = (path: string, timeout: Duration.Input) =>
  tryLock(path).pipe(
    Effect.repeat({
      until: (held) => held,
      schedule: Schedule.spaced(RETRY),
    }),
    Effect.asVoid,
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () =>
        Effect.fail(
          new Error(
            `Waited ${Duration.format(Duration.fromInputUnsafe(timeout))} for port ${lockPort(path)}, the lock of ${path}; if no kestack CLI is downloading it, another program holds the port`,
          ),
        ),
    }),
  );
