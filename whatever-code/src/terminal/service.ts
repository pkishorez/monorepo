import { spawn as ptySpawn, type IPty } from 'node-pty';
import { Effect, Stream, Queue, Scope } from 'effect';
import { ulid } from 'ulid';
import { AppError } from '../api/definitions/app.js';

interface TerminalSession {
  sessionId: string;
  absolutePath: string;
  name: string;
  pty: IPty;
}

export class TerminalService extends Effect.Service<TerminalService>()(
  'TerminalService',
  {
    effect: Effect.gen(function* () {
      /** Terminal sessions keyed by "absolutePath:name". */
      const sessionsByKey = new Map<string, TerminalSession>();
      /** Reverse lookup: sessionId → TerminalSession. */
      const sessionsById = new Map<string, TerminalSession>();

      const makeKey = (absolutePath: string, name: string) =>
        `${absolutePath}:${name}`;

      const open = (absolutePath: string, name: string = 'default') =>
        Effect.gen(function* () {
          const key = makeKey(absolutePath, name);
          const existing = sessionsByKey.get(key);
          if (existing) {
            return { sessionId: existing.sessionId, alreadyRunning: true };
          }

          const sessionId = ulid();

          const pty = yield* Effect.try({
            try: () =>
              ptySpawn('nvim', [], {
                name: 'xterm-256color',
                cols: 80,
                rows: 24,
                cwd: absolutePath,
                env: process.env as Record<string, string>,
              }),
            catch: (e) =>
              new AppError({
                message: `Failed to spawn nvim: ${e instanceof Error ? e.message : String(e)}`,
              }),
          });

          const session: TerminalSession = {
            sessionId,
            absolutePath,
            name,
            pty,
          };
          sessionsByKey.set(key, session);
          sessionsById.set(sessionId, session);

          pty.onExit(() => {
            sessionsByKey.delete(key);
            sessionsById.delete(sessionId);
          });

          return { sessionId, alreadyRunning: false };
        });

      const getSession = (sessionId: string) =>
        Effect.gen(function* () {
          const session = sessionsById.get(sessionId);
          if (!session) {
            return yield* Effect.fail(
              new AppError({
                message: `Terminal session not found: ${sessionId}`,
              }),
            );
          }
          return session;
        });

      const write = (sessionId: string, data: string) =>
        Effect.gen(function* () {
          const session = yield* getSession(sessionId);
          session.pty.write(data);
        });

      const resize = (sessionId: string, cols: number, rows: number) =>
        Effect.gen(function* () {
          const session = yield* getSession(sessionId);
          session.pty.resize(cols, rows);
        });

      const close = (sessionId: string) =>
        Effect.gen(function* () {
          const session = yield* getSession(sessionId);
          session.pty.kill();
          sessionsByKey.delete(makeKey(session.absolutePath, session.name));
          sessionsById.delete(sessionId);
        });

      const stream = (sessionId: string) =>
        Stream.unwrapScoped(
          Effect.gen(function* () {
            const session = yield* getSession(sessionId);
            const queue = yield* Queue.unbounded<string>();

            // Bridge node-pty's callback-based onData into an Effect Queue.
            const dataDisposable = session.pty.onData((data) => {
              Effect.runFork(Queue.offer(queue, data));
            });

            // Shut down the queue when the PTY exits so the stream completes cleanly.
            const exitDisposable = session.pty.onExit(() => {
              Effect.runFork(Queue.shutdown(queue));
            });

            // Clean up listeners when the stream scope is closed.
            yield* Scope.addFinalizer(
              yield* Effect.scope,
              Effect.sync(() => {
                dataDisposable.dispose();
                exitDisposable.dispose();
              }),
            );

            // Bounce the PTY size to force SIGWINCH so the foreground process
            // redraws its screen. Essential when a client reconnects to a
            // running session (the new xterm instance has no prior content).
            const { cols, rows } = session.pty;
            session.pty.resize(Math.max(1, cols - 1), rows);
            session.pty.resize(cols, rows);

            return Stream.fromQueue(queue);
          }),
        );

      return { open, write, resize, close, stream };
    }),
  },
) {}
