import { type ChildProcess, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname } from 'node:path';
import { Duration, Effect, Queue, Schedule } from 'effect';
import { isReady, PluginEnv } from '../../../http/plugin/contract/index.js';
import type { PluginRun } from '../contract/index.js';

export const LOG_LINES = 50;

const GRACE = Duration.seconds(10);
const SOCKET_FREE = Duration.seconds(15);
const GONE = Duration.seconds(25);

const running = new Map<string, ChildProcess>();

export type Event =
  | { readonly _tag: 'Lines'; readonly lines: ReadonlyArray<string> }
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Exit'; readonly code: number | null };

const listening = (socket: string) =>
  Effect.callback<boolean>((resume) => {
    const probe = connect({ path: socket });
    probe.once('connect', () => {
      probe.destroy();
      resume(Effect.succeed(true));
    });
    probe.once('error', () => resume(Effect.succeed(false)));
  });

export const socketFree = (socket: string) =>
  listening(socket).pipe(
    Effect.repeat({
      while: (busy) => busy,
      schedule: Schedule.spaced('100 millis'),
    }),
    Effect.map((busy) => !busy),
    Effect.timeoutOrElse({
      duration: SOCKET_FREE,
      orElse: () => Effect.succeed(false),
    }),
  );

const lineSplitter = (emit: (lines: ReadonlyArray<string>) => void) => {
  let rest = '';
  return (chunk: Buffer) => {
    const parts = (rest + chunk.toString('utf8')).split(/\r?\n/);
    rest = parts.pop() ?? '';
    if (parts.length > 0) emit(parts);
  };
};

const exited = (child: ChildProcess) =>
  child.exitCode !== null || child.signalCode !== null;

const waitExit = (child: ChildProcess, within: Duration.Input) =>
  Effect.callback<boolean>((resume) => {
    if (exited(child)) return resume(Effect.succeed(true));
    const timer = setTimeout(
      () => resume(Effect.succeed(false)),
      Duration.toMillis(Duration.fromInputUnsafe(within)),
    );
    child.once('exit', () => {
      clearTimeout(timer);
      resume(Effect.succeed(true));
    });
  });

export const previousGone = (data: string) =>
  Effect.suspend(() => {
    const previous = running.get(data);
    return previous === undefined || previous.pid === undefined
      ? Effect.succeed(true)
      : waitExit(previous, GONE);
  });

const stop = (child: ChildProcess) =>
  Effect.gen(function* () {
    if (exited(child)) return;
    child.kill('SIGTERM');
    if (yield* waitExit(child, GRACE)) return;
    child.kill('SIGKILL');
    yield* waitExit(child, GRACE);
  });

export const child = (run: PluginRun, file: string) =>
  Effect.gen(function* () {
    const events = yield* Queue.unbounded<Event>();
    for (const folder of [
      run.folders.data,
      run.folders.state,
      run.folders.cache,
      dirname(run.logFile),
    ])
      mkdirSync(folder, { recursive: true, mode: 0o700 });
    const keep = (lines: ReadonlyArray<string>) => {
      appendFileSync(run.logFile, lines.map((line) => `${line}\n`).join(''));
      Queue.offerUnsafe(events, { _tag: 'Lines', lines });
    };
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const started = spawn(process.execPath, [file], {
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          env: {
            ...process.env,
            [PluginEnv.name]: run.name,
            [PluginEnv.socket]: run.socket,
            [PluginEnv.data]: run.folders.data,
            [PluginEnv.state]: run.folders.state,
            [PluginEnv.cache]: run.folders.cache,
          },
        });
        running.set(run.folders.data, started);
        started.once('exit', () => {
          if (running.get(run.folders.data) === started)
            running.delete(run.folders.data);
        });
        started.stdout?.on('data', lineSplitter(keep));
        started.stderr?.on('data', lineSplitter(keep));
        started.on('message', (message) => {
          if (isReady(message)) Queue.offerUnsafe(events, { _tag: 'Ready' });
        });
        started.on('error', (error) =>
          keep([`Could not start ${file}: ${error.message}`]),
        );
        started.on('close', (code) =>
          Queue.offerUnsafe(events, { _tag: 'Exit', code }),
        );
        return started;
      }),
      stop,
    );
    return events;
  });
