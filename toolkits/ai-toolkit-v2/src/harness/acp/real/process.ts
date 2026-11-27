import * as acp from '@agentclientprotocol/sdk/unstable';
import { Effect, Layer, Queue, Stream } from 'effect';
import type { Cause } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { AcpError } from '../contract/index.ts';
import { AcpDriver } from '../shared/index.ts';

export interface Options {
  readonly command: string;
  readonly args?: ReadonlyArray<string>;
  readonly env?: Record<string, string>;
}

export const layer = (options: Options) =>
  Layer.effect(
    AcpDriver,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const connect = (app: acp.ClientApp, cwd: string | undefined) =>
        Effect.gen(function* () {
          const input = yield* Queue.unbounded<Uint8Array, Cause.Done>();
          const handle = yield* spawner.spawn(
            ChildProcess.make(options.command, [...(options.args ?? [])], {
              cwd,
              env: options.env,
              extendEnv: true,
              stdin: Stream.fromQueue(input),
              stderr: 'ignore',
            }),
          );
          const writable = new WritableStream<Uint8Array>({
            write: (chunk) => {
              Queue.offerUnsafe(input, chunk);
            },
            close: () => {
              Queue.endUnsafe(input);
            },
          });
          const connection = app.connect(
            acp.ndJsonStream(writable, Stream.toReadableStream(handle.stdout)),
          );
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => connection.close()),
          );
          yield* handle.exitCode.pipe(
            Effect.exit,
            Effect.andThen(
              Effect.sync(() =>
                connection.close(
                  new AcpError({ message: `${options.command} exited` }),
                ),
              ),
            ),
            Effect.forkScoped,
          );
          return connection;
        }).pipe(
          Effect.mapError(
            (cause) =>
              new AcpError({
                message: `could not start ${options.command}`,
                cause,
              }),
          ),
        );
      return AcpDriver.of({ connect });
    }),
  );
