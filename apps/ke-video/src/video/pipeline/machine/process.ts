import { type ChildProcess, spawn } from 'node:child_process';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Data, Effect, Queue } from 'effect';

/** A program or file on this computer did not do what a step needed. */
export class Failed extends Data.TaggedError('Failed')<{
  readonly message: string;
}> {}

/** How a program ended: its exit code, and the last lines it printed to stderr. */
export interface Ended {
  readonly code: number;
  readonly tail: ReadonlyArray<string>;
}

/** The last lines of stderr a program keeps for its error message. */
const TAIL = 12;

/** How long a program has to stop after SIGTERM, in milliseconds. */
const GRACE = 3000;

const exited = (child: ChildProcess) =>
  child.exitCode !== null || child.signalCode !== null;

const waitExit = (child: ChildProcess, within: number) =>
  Effect.callback<boolean>((resume) => {
    if (exited(child)) return resume(Effect.succeed(true));
    const timer = setTimeout(() => resume(Effect.succeed(false)), within);
    child.once('exit', () => {
      clearTimeout(timer);
      resume(Effect.succeed(true));
    });
  });

const stop = (child: ChildProcess) =>
  Effect.gen(function* () {
    if (child.pid === undefined || exited(child)) return;
    child.kill('SIGTERM');
    if (yield* waitExit(child, GRACE)) return;
    child.kill('SIGKILL');
    yield* waitExit(child, GRACE);
  });

/** Splits what a stream prints into whole lines, \r ending a line as \n does. */
const lineSplitter = (emit: (line: string) => void) => {
  let rest = '';
  return {
    chunk: (chunk: Buffer) => {
      const parts = (rest + chunk.toString('utf8')).split(/\r\n|\r|\n/);
      rest = parts.pop() ?? '';
      for (const part of parts) emit(part);
    },
    end: () => {
      if (rest !== '') emit(rest);
      rest = '';
    },
  };
};

/** A program started for the Scope, stopped when the Scope closes. */
const started = (
  command: string,
  args: ReadonlyArray<string>,
  stdin: 'ignore' | 'pipe',
) =>
  Effect.acquireRelease(
    Effect.sync(() =>
      spawn(command, [...args], { stdio: [stdin, 'pipe', 'pipe'] }),
    ),
    stop,
  );

type Item =
  | {
      readonly _tag: 'Line';
      readonly line: string;
      readonly from: 'out' | 'err';
    }
  | { readonly _tag: 'End'; readonly code: number }
  | { readonly _tag: 'Error'; readonly message: string };

/**
 * Runs `command` until it ends, handing each line it prints to `line`, in
 * order. Interrupted, the program gets SIGTERM, then SIGKILL after a few
 * seconds. Fails only when it cannot start.
 */
export const lines = <R = never>(
  command: string,
  args: ReadonlyArray<string>,
  line: (
    text: string,
    from: 'out' | 'err',
  ) => Effect.Effect<void, never, R> = () => Effect.void,
): Effect.Effect<Ended, Failed, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      const items = yield* Queue.unbounded<Item>();
      const child = yield* started(command, args, 'ignore');
      const offer = (item: Item) => Queue.offerUnsafe(items, item);
      const out = lineSplitter((text) =>
        offer({ _tag: 'Line', line: text, from: 'out' }),
      );
      const err = lineSplitter((text) =>
        offer({ _tag: 'Line', line: text, from: 'err' }),
      );
      child.stdout?.on('data', out.chunk);
      child.stderr?.on('data', err.chunk);
      child.on('error', (error) =>
        offer({
          _tag: 'Error',
          message: `${command} could not start: ${error.message}`,
        }),
      );
      child.on('close', (code, signal) => {
        out.end();
        err.end();
        offer({ _tag: 'End', code: code ?? (signal === null ? 1 : 128) });
      });
      const tail: Array<string> = [];
      for (;;) {
        const item = yield* Queue.take(items);
        if (item._tag === 'Error')
          return yield* new Failed({ message: item.message });
        if (item._tag === 'End') return { code: item.code, tail };
        if (item.from === 'err' && item.line.trim() !== '') {
          tail.push(item.line);
          if (tail.length > TAIL) tail.shift();
        }
        yield* line(item.line, item.from);
      }
    }),
  );

/** Runs `command` until it ends, keeping all it prints to stdout. */
export const capture = (
  command: string,
  args: ReadonlyArray<string>,
): Effect.Effect<Ended & { readonly out: string }, Failed> =>
  Effect.scoped(
    Effect.gen(function* () {
      const child = yield* started(command, args, 'ignore');
      const chunks: Array<Buffer> = [];
      const tail: Array<string> = [];
      const err = lineSplitter((text) => {
        if (text.trim() === '') return;
        tail.push(text);
        if (tail.length > TAIL) tail.shift();
      });
      child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr?.on('data', err.chunk);
      const code = yield* Effect.callback<number, Failed>((resume) => {
        child.once('error', (error) =>
          resume(
            Effect.fail(
              new Failed({
                message: `${command} could not start: ${error.message}`,
              }),
            ),
          ),
        );
        child.once('close', (code, signal) => {
          err.end();
          resume(Effect.succeed(code ?? (signal === null ? 1 : 128)));
        });
      });
      return { code, tail, out: Buffer.concat(chunks).toString('utf8') };
    }),
  );

/**
 * Runs `from` into `to`: what `from` prints to stdout goes through
 * `change` into `to`'s stdin. Both are stopped if interrupted.
 */
export const pipe = (
  from: readonly [string, ReadonlyArray<string>],
  to: readonly [string, ReadonlyArray<string>],
  change: (chunk: Buffer) => Buffer,
): Effect.Effect<{ readonly from: Ended; readonly to: Ended }, Failed> =>
  Effect.scoped(
    Effect.gen(function* () {
      const source = yield* started(from[0], from[1], 'ignore');
      const sink = yield* started(to[0], to[1], 'pipe');
      const tails = [source, sink].map((child) => {
        const tail: Array<string> = [];
        const err = lineSplitter((text) => {
          if (text.trim() === '') return;
          tail.push(text);
          if (tail.length > TAIL) tail.shift();
        });
        child.stderr?.on('data', err.chunk);
        return tail;
      });
      sink.stdout?.resume();
      const ended = (child: ChildProcess, name: string) =>
        Effect.callback<number, Failed>((resume) => {
          if (exited(child))
            return resume(Effect.succeed(child.exitCode ?? 128));
          child.once('error', (error) =>
            resume(
              Effect.fail(
                new Failed({
                  message: `${name} could not start: ${error.message}`,
                }),
              ),
            ),
          );
          child.once('close', (code) => resume(Effect.succeed(code ?? 128)));
        });
      const flow = Effect.tryPromise({
        try: () =>
          pipeline(
            source.stdout!,
            new Transform({
              transform(chunk: Buffer, _encoding, done) {
                done(null, change(chunk));
              },
            }),
            sink.stdin!,
          ),
        catch: (cause) =>
          new Failed({
            message: `${from[0]} into ${to[0]} broke: ${cause instanceof Error ? cause.message : String(cause)}`,
          }),
      });
      const [, sourceCode, sinkCode] = yield* Effect.all(
        [Effect.ignore(flow), ended(source, from[0]), ended(sink, to[0])],
        { concurrency: 'unbounded' },
      );
      return {
        from: { code: sourceCode, tail: tails[0]! },
        to: { code: sinkCode, tail: tails[1]! },
      };
    }),
  );
