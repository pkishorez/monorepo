import path from 'node:path';
import { Context, Effect, Layer, Option, PubSub, Stream, Ref } from 'effect';
import * as pty from 'node-pty';
import XtermHeadless from '@xterm/headless';
const HeadlessTerminal = XtermHeadless.Terminal;
import { SerializeAddon } from '@xterm/addon-serialize';
import {
  TerminalSpawnError,
  TerminalNotFoundError,
} from '../domain/terminal/index.js';

const BATCH_INTERVAL_MS = 16;

export interface TerminalSession {
  readonly id: number;
  readonly pty: pty.IPty;
  readonly headless: InstanceType<typeof HeadlessTerminal>;
  readonly serialize: SerializeAddon;
  readonly command: Option.Option<{
    cmd: string;
    args: Option.Option<readonly string[]>;
  }>;
  readonly cwd: string;
  readonly cols: Ref.Ref<number>;
  readonly rows: Ref.Ref<number>;
  readonly status: Ref.Ref<'running' | 'exited'>;
  readonly exitCode: Ref.Ref<Option.Option<number>>;
  readonly outputPubSub: PubSub.PubSub<string>;
}

export class TerminalService extends Context.Tag('TerminalService')<
  TerminalService,
  {
    readonly create: (params: {
      command: Option.Option<{
        cmd: string;
        args: Option.Option<readonly string[]>;
      }>;
      cwd: string;
      env: Option.Option<Record<string, string>>;
      cols: number;
      rows: number;
      scrollback: number;
    }) => Effect.Effect<{ id: number }, TerminalSpawnError>;

    readonly list: () => Effect.Effect<
      Array<{
        id: number;
        command: Option.Option<{
          cmd: string;
          args: Option.Option<readonly string[]>;
        }>;
        cwd: string;
        cols: number;
        rows: number;
        status: 'running' | 'exited';
        exitCode: Option.Option<number>;
      }>
    >;

    readonly getSnapshot: (
      id: number,
    ) => Effect.Effect<{ data: string }, TerminalNotFoundError>;

    readonly stream: (
      id: number,
    ) => Effect.Effect<Stream.Stream<string>, TerminalNotFoundError>;

    readonly write: (
      id: number,
      data: string,
    ) => Effect.Effect<void, TerminalNotFoundError>;

    readonly resize: (
      id: number,
      cols: number,
      rows: number,
    ) => Effect.Effect<void, TerminalNotFoundError>;

    readonly kill: (id: number) => Effect.Effect<void, TerminalNotFoundError>;
  }
>() {}

export const TerminalServiceLive = Layer.effect(
  TerminalService,
  Effect.gen(function* () {
    const sessions = yield* Ref.make<Map<number, TerminalSession>>(new Map());
    const nextId = yield* Ref.make(1);

    const getSession = (id: number) =>
      Effect.gen(function* () {
        const map = yield* Ref.get(sessions);
        const session = map.get(id);
        if (!session) return yield* new TerminalNotFoundError({ id });
        return session;
      });

    return {
      create: (params) =>
        Effect.gen(function* () {
          const id = yield* Ref.getAndUpdate(nextId, (n) => n + 1);

          const shell = process.env.SHELL ?? '/bin/sh';
          const cmd = Option.match(params.command, {
            onNone: () => shell,
            onSome: (c) => c.cmd,
          });
          const args = Option.match(params.command, {
            onNone: () => [] as string[],
            onSome: (c) =>
              Option.match(c.args, {
                onNone: () => [] as string[],
                onSome: (a) => [...a],
              }),
          });

          const env = Option.match(params.env, {
            onNone: () => process.env as Record<string, string>,
            onSome: (e) => ({ ...process.env, ...e }) as Record<string, string>,
          });

          const outputPubSub = yield* PubSub.unbounded<string>();

          let ptyProcess: pty.IPty;
          try {
            ptyProcess = pty.spawn(cmd, args, {
              name: 'xterm-256color',
              cols: params.cols,
              rows: params.rows,
              cwd: path.resolve(params.cwd),
              env,
            });
          } catch (err) {
            return yield* new TerminalSpawnError({
              message: err instanceof Error ? err.message : String(err),
            });
          }

          const headless = new HeadlessTerminal({
            allowProposedApi: true,
            cols: params.cols,
            rows: params.rows,
            scrollback: params.scrollback,
          });
          const serialize = new SerializeAddon();
          headless.loadAddon(serialize);

          const cols = yield* Ref.make(params.cols);
          const rows = yield* Ref.make(params.rows);
          const status = yield* Ref.make<'running' | 'exited'>('running');
          const exitCode = yield* Ref.make<Option.Option<number>>(
            Option.none(),
          );

          const session: TerminalSession = {
            id,
            pty: ptyProcess,
            headless,
            serialize,
            command: params.command,
            cwd: params.cwd,
            cols,
            rows,
            status,
            exitCode,
            outputPubSub,
          };

          let batch = '';
          let batchTimer: ReturnType<typeof setTimeout> | null = null;

          const flushBatch = () => {
            if (batch.length > 0) {
              const data = batch;
              batch = '';
              headless.write(data);
              Effect.runFork(PubSub.publish(outputPubSub, data));
            }
            batchTimer = null;
          };

          ptyProcess.onData((data) => {
            batch += data;
            if (!batchTimer) {
              batchTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
            }
          });

          ptyProcess.onExit(({ exitCode: code }) => {
            if (batchTimer) {
              clearTimeout(batchTimer);
              flushBatch();
            }
            Effect.runFork(
              Effect.gen(function* () {
                yield* Ref.set(status, 'exited');
                yield* Ref.set(exitCode, Option.some(code));
                yield* PubSub.shutdown(outputPubSub);
              }),
            );
          });

          yield* Ref.update(sessions, (map) => new Map(map).set(id, session));

          return { id };
        }),

      list: () =>
        Effect.gen(function* () {
          const map = yield* Ref.get(sessions);
          const results: Array<{
            id: number;
            command: Option.Option<{
              cmd: string;
              args: Option.Option<readonly string[]>;
            }>;
            cwd: string;
            cols: number;
            rows: number;
            status: 'running' | 'exited';
            exitCode: Option.Option<number>;
          }> = [];
          for (const session of map.values()) {
            results.push({
              id: session.id,
              command: session.command,
              cwd: session.cwd,
              cols: yield* Ref.get(session.cols),
              rows: yield* Ref.get(session.rows),
              status: yield* Ref.get(session.status),
              exitCode: yield* Ref.get(session.exitCode),
            });
          }
          return results;
        }),

      getSnapshot: (id) =>
        Effect.gen(function* () {
          const session = yield* getSession(id);
          return { data: session.serialize.serialize() };
        }),

      stream: (id) =>
        Effect.gen(function* () {
          const session = yield* getSession(id);
          return Stream.unwrapScoped(
            Effect.map(
              PubSub.subscribe(session.outputPubSub),
              Stream.fromQueue,
            ),
          );
        }),

      write: (id, data) =>
        Effect.gen(function* () {
          const session = yield* getSession(id);
          session.pty.write(data);
        }),

      resize: (id, cols, rows) =>
        Effect.gen(function* () {
          const session = yield* getSession(id);
          session.pty.resize(cols, rows);
          session.headless.resize(cols, rows);
          yield* Ref.set(session.cols, cols);
          yield* Ref.set(session.rows, rows);
        }),

      kill: (id) =>
        Effect.gen(function* () {
          const session = yield* getSession(id);
          session.pty.kill();
        }),
    };
  }),
);
