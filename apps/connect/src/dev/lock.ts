import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { resolve } from 'node:path';

/*
 * One dev process at a time decides whether this branch's Connect must be
 * started. The lock is a TCP port on 127.0.0.1, derived from the absolute
 * `dir`, which is already one per branch: holding it is listening on it.
 * The kernel gives the port back when the process exits, however it
 * exits, so a lock is never left behind and nothing is ever taken over.
 * Nothing talks to the lock: a connection to it is closed at once, and
 * giving the lock back closes any still open, so none can hold it up.
 */

export interface LockOptions {
  /** How often to try again; 100 ms. */
  readonly retryMs?: number;
  /** How long to keep trying before failing; 30 s. */
  readonly timeoutMs?: number;
}

/*
 * 20000–29999 is below every common range the OS hands out for port 0
 * (macOS and Windows 49152–65535, Linux 32768–60999), so the Connection,
 * which listens on port 0, is never given a lock's port; and above
 * Portless's app ports, 4000–4999.
 */
const FIRST_PORT = 20_000;
const PORTS = 10_000;

/** The port that is the lock in `dir`: one of 20000–29999. */
export const lockPort = (dir: string) =>
  FIRST_PORT +
  (createHash('sha256').update(resolve(dir)).digest().readUInt32BE(0) % PORTS);

/** Listens on `port`, if it is free; undefined when it is held. */
const listen = (port: number) =>
  new Promise<Server | undefined>((done, fail) => {
    // Each connection is closed as it comes, so `close` never waits on one.
    const server = createServer((socket) => socket.destroy());
    server.once('error', (error: NodeJS.ErrnoException) =>
      error.code === 'EADDRINUSE' ? done(undefined) : fail(error),
    );
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () =>
      done(server),
    );
  });

/** Runs `fn` holding the lock in `dir`; fails after `timeoutMs`. */
export const withLock = async <A>(
  dir: string,
  fn: () => Promise<A>,
  options: LockOptions = {},
): Promise<A> => {
  const { retryMs = 100, timeoutMs = 30_000 } = options;
  const port = lockPort(dir);
  const until = Date.now() + timeoutMs;
  let server: Server | undefined;
  while ((server = await listen(port)) === undefined) {
    if (Date.now() > until)
      throw new Error(
        `Could not take the lock for ${dir} within ${timeoutMs / 1000} s: port ${port} is held; if no ke-connect dev is running, another program owns it.`,
      );
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  const held = server;
  try {
    return await fn();
  } finally {
    await new Promise((resolve) => held.close(resolve));
  }
};
