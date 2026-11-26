import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { resolve } from 'node:path';
import { Duration, Effect, Layer, Schedule } from 'effect';
import { Locks, LockTimeout } from '../contract/index.js';

const FIRST_PORT = 20_000;
const PORTS = 10_000;
const RETRY = Duration.millis(100);

export const lockPort = (path: string) =>
  FIRST_PORT +
  (createHash('sha256').update(resolve(path)).digest().readUInt32BE(0) % PORTS);

const listen = (port: number) =>
  Effect.callback<Server | undefined, Error>((resume) => {
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

export const tryHold = (path: string) =>
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

export const hold = (path: string, timeout: Duration.Input) =>
  tryHold(path).pipe(
    Effect.repeat({ until: (held) => held, schedule: Schedule.spaced(RETRY) }),
    Effect.asVoid,
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () =>
        Effect.fail(
          new LockTimeout({
            path,
            message: `Waited ${Duration.format(Duration.fromInputUnsafe(timeout))} for port ${lockPort(path)}, the lock of ${path}; if no ke-connect is working on it, another program holds the port`,
          }),
        ),
    }),
  );

export const layer = Layer.succeed(Locks, Locks.of({ tryHold, hold }));
