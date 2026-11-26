import { NodeServices } from '@effect/platform-node';
import { Deferred, Effect, Layer, Queue, Stream } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import {
  CodexError,
  type Method,
  type Params,
  type Result,
} from '../contract/index.ts';
import { Driver, type Connection, type Message } from '../shared/index.ts';

export interface Options {
  readonly command?: string;
  readonly args?: ReadonlyArray<string>;
  readonly env?: Readonly<Record<string, string>>;
}

interface Envelope {
  readonly id?: number | string;
  readonly method?: string;
  readonly result?: unknown;
  readonly error?: unknown;
}

const STDERR_TAIL = 2_000;

const parse = (line: string): Envelope | undefined => {
  try {
    return JSON.parse(line) as Envelope;
  } catch {
    return undefined;
  }
};

const start =
  (
    options: Options,
    spawner: ChildProcessSpawner.ChildProcessSpawner['Service'],
  ) =>
  (cwd: string | undefined) =>
    Effect.gen(function* () {
      const input = yield* Queue.unbounded<string>();
      const messages = yield* Queue.unbounded<Message, CodexError>();
      const pending = new Map<number, Deferred.Deferred<unknown, CodexError>>();
      let next = 1;
      let stderr = '';
      let exited: CodexError | undefined;

      const handle = yield* spawner
        .spawn(
          ChildProcess.make(
            options.command ?? 'codex',
            [...(options.args ?? []), 'app-server'],
            {
              cwd: cwd ?? process.cwd(),
              env: options.env,
              extendEnv: true,
              stdin: Stream.fromQueue(input).pipe(Stream.encodeText),
              forceKillAfter: '3 seconds',
            },
          ),
        )
        .pipe(
          Effect.mapError(
            (cause) =>
              new CodexError({
                message: 'Could not start codex app-server',
                cause,
              }),
          ),
        );

      const write = (value: unknown) =>
        Queue.offer(input, `${JSON.stringify(value)}\n`);

      const exit = (cause: unknown) =>
        Effect.gen(function* () {
          exited = new CodexError({
            message: `codex app-server exited${stderr === '' ? '' : `: ${stderr.trim()}`}`,
            cause,
          });
          for (const call of pending.values())
            yield* Deferred.fail(call, exited);
          pending.clear();
          yield* Queue.fail(messages, exited);
        });

      const dispatch = (line: string) =>
        Effect.gen(function* () {
          const envelope = parse(line);
          if (envelope === undefined) return;
          if (envelope.method === undefined) {
            if (typeof envelope.id !== 'number') return;
            const call = pending.get(envelope.id);
            pending.delete(envelope.id);
            if (call === undefined) return;
            if (envelope.error === undefined)
              yield* Deferred.succeed(call, envelope.result);
            else
              yield* Deferred.fail(
                call,
                new CodexError({
                  message: `codex: ${JSON.stringify(envelope.error)}`,
                  cause: envelope.error,
                }),
              );
            return;
          }
          yield* Queue.offer(messages, envelope as Message);
        });

      yield* handle.stderr.pipe(
        Stream.decodeText(),
        Stream.runForEach((chunk) =>
          Effect.sync(() => {
            stderr = (stderr + chunk).slice(-STDERR_TAIL);
          }),
        ),
        Effect.ignore,
        Effect.forkScoped,
      );
      yield* handle.stdout.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.runForEach(dispatch),
        Effect.flatMap(() => handle.exitCode),
        Effect.matchEffect({ onFailure: exit, onSuccess: exit }),
        Effect.forkScoped,
      );

      const request = <M extends Method>(method: M, params: Params<M>) =>
        Effect.gen(function* () {
          if (exited !== undefined) return yield* exited;
          const id = next++;
          const call = yield* Deferred.make<unknown, CodexError>();
          pending.set(id, call);
          yield* write({ id, method, params });
          return (yield* Deferred.await(call)) as Result<M>;
        });

      yield* request('initialize', {
        clientInfo: {
          name: 'ai-toolkit-v2',
          title: 'AI Toolkit',
          version: '0.0.0',
        },
        capabilities: { experimentalApi: true, requestAttestation: false },
      });
      yield* write({ method: 'initialized' });

      return {
        request,
        respond: (id, answer) => write({ id, result: answer }),
        messages: Stream.fromQueue(messages),
      } satisfies Connection;
    });

export const layer = (options: Options = {}) =>
  Layer.effect(
    Driver,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      return Driver.of({ start: start(options, spawner) });
    }),
  ).pipe(Layer.provide(NodeServices.layer));
