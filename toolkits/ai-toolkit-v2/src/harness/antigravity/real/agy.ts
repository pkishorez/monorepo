import * as acp from '@agentclientprotocol/sdk/unstable';
import { Effect, Layer, Queue, Stream } from 'effect';
import type { Cause } from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import {
  AntigravityError,
  type Flags,
  type PromptInput,
  type Result,
} from '../contract/index.ts';
import { Driver } from '../shared/index.ts';

export interface Options {
  readonly binary?: string;
}

const json = (value: Readonly<Record<string, unknown>> | string) =>
  typeof value === 'string' ? value : JSON.stringify(value);

const option = (name: string, value: string | undefined) =>
  value === undefined ? [] : [name, value];

const flag = (name: string, value: boolean | undefined) =>
  value === true ? [name] : [];

export const acpArgs = (flags: Flags = {}): ReadonlyArray<string> => [
  'acp',
  ...(flags.addDir ?? []).flatMap((dir) => ['--add-dir', dir]),
  ...option('--agent', flags.agent),
  ...option('--gemini-dir', flags.geminiDir),
  ...option('--app-data-dir', flags.appDataDir),
  ...flag('--sandbox', flags.sandbox),
  ...flag('--dangerously-skip-permissions', flags.dangerouslySkipPermissions),
  ...(flags.args ?? []),
];

export const printArgs = (input: PromptInput): ReadonlyArray<string> => [
  `--print=${input.prompt}`,
  '--output-format',
  'json',
  ...option('--model', input.model),
  ...option('--effort', input.effort),
  ...option('--mode', input.mode),
  ...option('--settings', input.settings && json(input.settings)),
  ...option('--json-schema', input.jsonSchema && json(input.jsonSchema)),
  ...(input.args ?? []),
];

const failure = (message: string) => (cause: unknown) =>
  new AntigravityError({ message, cause });

export const layer = (options: Options = {}) =>
  Layer.effect(
    Driver,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const binary = options.binary ?? 'agy';

      const connect = (
        app: acp.ClientApp,
        cwd: string | undefined,
        flags: Flags | undefined,
      ) =>
        Effect.gen(function* () {
          const input = yield* Queue.unbounded<Uint8Array, Cause.Done>();
          const handle = yield* spawner
            .spawn(
              ChildProcess.make(binary, [...acpArgs(flags)], {
                cwd,
                stdin: Stream.fromQueue(input),
                stderr: 'ignore',
                forceKillAfter: '3 seconds',
              }),
            )
            .pipe(Effect.mapError(failure(`${binary} acp could not start`)));
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
                  new AntigravityError({ message: `${binary} acp exited` }),
                ),
              ),
            ),
            Effect.forkScoped,
          );
          return connection;
        });

      const print = (input: PromptInput) =>
        spawner
          .string(
            ChildProcess.make(binary, [...printArgs(input)], {
              cwd: input.cwd,
            }),
          )
          .pipe(
            Effect.mapError(failure(`${binary} --print failed`)),
            Effect.flatMap((text) =>
              Effect.try({
                try: () => JSON.parse(text) as Result,
                catch: failure(`${binary} --print gave no JSON: ${text}`),
              }),
            ),
          );

      return Driver.of({ connect, print });
    }),
  );
