import { type ChildProcess, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname } from 'node:path';
import { Duration, Effect, Queue, Schedule } from 'effect';
import { PluginEnv } from '../contract/index.js';

/*
 * One Plugin process, for the Scope: Node running its file, with its socket
 * and folders in the environment. What it prints is split into lines and
 * kept in its log file; what happens to it arrives as Events. Closing the
 * Scope stops it: SIGTERM, then SIGKILL if it is still there after ten
 * seconds, and waits until it is gone. Kabuki does not wait for a stopped
 * Worker's Scope to close, so a new process on the same socket waits
 * itself for the one before it to exit, not only to leave the socket: two
 * never run at once on one socket's folders.
 */

/** How many of its last lines a Plugin's log keeps in memory. */
export const LOG_LINES = 50;

/** How long a Plugin has to stop after SIGTERM. */
const GRACE = Duration.seconds(10);

/** How long a new Plugin waits for the one before it to leave the socket. */
const SOCKET_FREE = Duration.seconds(15);

/** How long a new Plugin waits for the one before it to exit: its grace, its kill, and a little more. */
const GONE = Duration.seconds(25);

/** The process last started on each socket, until it exits. */
const started = new Map<string, ChildProcess>();

/** What happens to a Plugin process. */
export type Event =
  | { readonly _tag: 'Lines'; readonly lines: ReadonlyArray<string> }
  | { readonly _tag: 'Ready' }
  | { readonly _tag: 'Exit'; readonly code: number | null };

export interface ChildOptions {
  readonly name: string;
  readonly file: string;
  readonly socket: string;
  readonly folders: {
    readonly data: string;
    readonly state: string;
    readonly cache: string;
    readonly shared: string;
  };
  /** Where its output is kept. */
  readonly logFile: string;
}

/** Whether something listens on `socket` now. */
const listening = (socket: string) =>
  Effect.callback<boolean>((resume) => {
    const probe = connect({ path: socket });
    probe.once('connect', () => {
      probe.destroy();
      resume(Effect.succeed(true));
    });
    probe.once('error', () => resume(Effect.succeed(false)));
  });

/** Waits until nothing listens on `socket`: whether it got free in time. */
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

/** Splits what a stream prints into whole lines, holding back a line not yet ended. */
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

/** Waits up to `within` for `child` to exit: whether it did. */
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

/** Waits until the process last started on `socket` has exited: whether it did in time. */
export const previousGone = (socket: string) =>
  Effect.suspend(() => {
    const previous = started.get(socket);
    // One that never started has no pid, and never exits.
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

/** Starts the Plugin process for the Scope: its Events, ending with Exit. */
export const child = (options: ChildOptions) =>
  Effect.gen(function* () {
    const events = yield* Queue.unbounded<Event>();
    for (const folder of [
      options.folders.data,
      options.folders.state,
      options.folders.cache,
      options.folders.shared,
      dirname(options.logFile),
    ])
      mkdirSync(folder, { recursive: true, mode: 0o700 });
    const keep = (lines: ReadonlyArray<string>) => {
      appendFileSync(
        options.logFile,
        lines.map((line) => `${line}\n`).join(''),
      );
      Queue.offerUnsafe(events, { _tag: 'Lines', lines });
    };
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const process_ = spawn(process.execPath, [options.file], {
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
          env: {
            ...process.env,
            [PluginEnv.name]: options.name,
            [PluginEnv.socket]: options.socket,
            [PluginEnv.data]: options.folders.data,
            [PluginEnv.state]: options.folders.state,
            [PluginEnv.cache]: options.folders.cache,
            [PluginEnv.shared]: options.folders.shared,
          },
        });
        started.set(options.socket, process_);
        process_.once('exit', () => {
          if (started.get(options.socket) === process_)
            started.delete(options.socket);
        });
        process_.stdout?.on('data', lineSplitter(keep));
        process_.stderr?.on('data', lineSplitter(keep));
        process_.on('message', (message) => {
          if (
            typeof message === 'object' &&
            message !== null &&
            'ready' in message &&
            message.ready === true
          )
            Queue.offerUnsafe(events, { _tag: 'Ready' });
        });
        process_.on('error', (error) =>
          keep([`Could not start ${options.file}: ${error.message}`]),
        );
        // `close` comes after the last of its output.
        process_.on('close', (code) =>
          Queue.offerUnsafe(events, { _tag: 'Exit', code }),
        );
        return process_;
      }),
      stop,
    );
    return events;
  });
