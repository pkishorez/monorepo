import { spawn as ptySpawn, type IPty } from "node-pty";
import { Effect, Stream, Queue, Scope } from "effect";
import { ulid } from "ulid";
import { AppError } from "../api/definitions/app.js";

interface TerminalSession {
  sessionId: string;
  absolutePath: string;
  pty: IPty;
}

export class TerminalService extends Effect.Service<TerminalService>()(
  "TerminalService",
  {
    effect: Effect.gen(function* () {
      /** One terminal session per project, keyed by absolutePath. */
      const sessionsByProject = new Map<string, TerminalSession>();
      /** Reverse lookup: sessionId → TerminalSession. */
      const sessionsById = new Map<string, TerminalSession>();

      const open = (absolutePath: string) =>
        Effect.gen(function* () {
          const existing = sessionsByProject.get(absolutePath);
          if (existing) {
            return { sessionId: existing.sessionId, alreadyRunning: true };
          }

          const sessionId = ulid();

          const pty = yield* Effect.try({
            try: () =>
              ptySpawn("nvim", [], {
                name: "xterm-256color",
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

          const session: TerminalSession = { sessionId, absolutePath, pty };
          sessionsByProject.set(absolutePath, session);
          sessionsById.set(sessionId, session);

          // Clean up maps when the PTY process exits.
          pty.onExit(() => {
            sessionsByProject.delete(absolutePath);
            sessionsById.delete(sessionId);
          });

          return { sessionId, alreadyRunning: false };
        });

      const getSession = (sessionId: string) =>
        Effect.gen(function* () {
          const session = sessionsById.get(sessionId);
          if (!session) {
            return yield* Effect.fail(
              new AppError({ message: `Terminal session not found: ${sessionId}` }),
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
          sessionsByProject.delete(session.absolutePath);
          sessionsById.delete(sessionId);
        });

      const stream = (sessionId: string) =>
        Stream.unwrapScoped(
          Effect.gen(function* () {
            const session = yield* getSession(sessionId);
            const queue = yield* Queue.unbounded<string>();

            // Bridge node-pty's callback-based onData into an Effect Queue.
            const disposable = session.pty.onData((data) => {
              Effect.runFork(Queue.offer(queue, data));
            });

            // Clean up the listener when the stream scope is closed.
            yield* Scope.addFinalizer(
              yield* Effect.scope,
              Effect.sync(() => disposable.dispose()),
            );

            return Stream.fromQueue(queue);
          }),
        );

      return { open, write, resize, close, stream };
    }),
  },
) {}
