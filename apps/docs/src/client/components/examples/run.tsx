import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Cause, Console, Effect, Exit, Fiber } from 'effect';
import type { Scope } from 'effect';
import { PlayIcon, RotateCcwIcon, SquareIcon } from 'lucide-react';
import { split } from './files.tsx';

/*
 * Code that runs on the page, with its console under it: core's way of
 * showing what an Actor does before anything draws it. The code is the
 * file a block includes, ```ts file=./run/counter.ts, and that file
 * exports the `program` it runs, so what is read is what runs. Run starts
 * it with Effect's Console swapped for one that writes here: each line
 * with how long after the start it came, a value laid out the way it
 * reads in code, a Message as its tag and its fields. What the program
 * gives back is the last line. Stop interrupts it, its Scope closing
 * behind it, and so does leaving the page.
 */

/** What a page runs: an Effect that may open a Scope and log as it goes. */
export type Program = Effect.Effect<unknown, unknown, Scope.Scope>;

type Kind = 'log' | 'info' | 'warn' | 'error' | 'result';

type Line = {
  readonly id: number;
  readonly kind: Kind;
  readonly args: ReadonlyArray<unknown>;
  /** Milliseconds after Run. */
  readonly at: number;
};

type Status =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Running' }
  | { readonly _tag: 'Done'; readonly ms: number }
  | { readonly _tag: 'Stopped' }
  | { readonly _tag: 'Failed' };

/** A Console that writes each call as a line. */
const consoleFor = (
  write: (kind: Kind, args: ReadonlyArray<unknown>) => void,
  clear: () => void,
): Console.Console => {
  const counts = new Map<string, number>();
  const timers = new Map<string, number>();
  const log = (...args: ReadonlyArray<unknown>) => write('log', args);
  return {
    assert: (condition, ...args) => {
      if (!condition) write('error', ['Assertion failed', ...args]);
    },
    clear,
    count: (label = 'default') => {
      const next = (counts.get(label) ?? 0) + 1;
      counts.set(label, next);
      write('log', [`${label}: ${next}`]);
    },
    countReset: (label = 'default') => counts.delete(label),
    debug: log,
    dir: (item) => write('log', [item]),
    dirxml: log,
    error: (...args) => write('error', args),
    group: log,
    groupCollapsed: log,
    groupEnd: () => {},
    info: (...args) => write('info', args),
    log,
    table: (data) => write('log', [data]),
    time: (label = 'default') => timers.set(label, performance.now()),
    timeEnd: (label = 'default') => {
      const start = timers.get(label);
      timers.delete(label);
      if (start !== undefined)
        write('log', [`${label}: ${Math.round(performance.now() - start)} ms`]);
    },
    timeLog: (label = 'default', ...args) => {
      const start = timers.get(label);
      if (start !== undefined)
        write('log', [
          `${label}: ${Math.round(performance.now() - start)} ms`,
          ...args,
        ]);
    },
    trace: log,
    warn: (...args) => write('warn', args),
  };
};

export function Run({
  program,
  caption,
  children,
}: {
  /** The `program` the file exports. */
  readonly program: Program;
  /** A line under it on what to look for. */
  readonly caption?: string;
  /** The code: blocks that include a file, the one exporting `program` first. */
  readonly children: ReactNode;
}) {
  const { files } = split(children);
  const [shown, setShown] = useState(0);
  const [lines, setLines] = useState<ReadonlyArray<Line>>([]);
  const [status, setStatus] = useState<Status>({ _tag: 'Idle' });
  const fiber = useRef<Fiber.Fiber<unknown, unknown> | null>(null);
  const output = useRef<HTMLOListElement>(null);

  // The program runs outside React; leaving the page stops it.
  useEffect(
    () => () => {
      if (fiber.current) Effect.runFork(Fiber.interrupt(fiber.current));
    },
    [],
  );

  // Follows the newest line, as a console does.
  useEffect(() => {
    const list = output.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lines]);

  const run = () => {
    if (fiber.current) Effect.runFork(Fiber.interrupt(fiber.current));
    const start = performance.now();
    let next = 0;
    const write = (kind: Kind, args: ReadonlyArray<unknown>) =>
      setLines((all) => [
        ...all,
        { id: next++, kind, args, at: performance.now() - start },
      ]);
    setLines([]);
    setStatus({ _tag: 'Running' });
    const self = Effect.runFork(
      program.pipe(
        Effect.scoped,
        Effect.provideService(
          Console.Console,
          consoleFor(write, () => setLines([])),
        ),
        Effect.onExit((exit) =>
          Effect.sync(() => {
            if (Exit.isSuccess(exit)) {
              if (exit.value !== undefined) write('result', [exit.value]);
              setStatus({ _tag: 'Done', ms: performance.now() - start });
            } else if (Cause.hasInterruptsOnly(exit.cause)) {
              setStatus({ _tag: 'Stopped' });
            } else {
              write('error', [Cause.pretty(exit.cause)]);
              setStatus({ _tag: 'Failed' });
            }
          }),
        ),
      ),
    );
    fiber.current = self;
  };

  const stop = () => {
    if (fiber.current) Effect.runFork(Fiber.interrupt(fiber.current));
  };

  const running = status._tag === 'Running';
  return (
    <figure className="my-8">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center border-b border-border bg-muted/40 pr-1.5">
          <div
            role="tablist"
            aria-label="The code"
            className="flex min-w-0 flex-1 overflow-x-auto px-2"
          >
            {files.map((file, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={shown === index}
                onClick={() => setShown(index)}
                className="flex h-10 shrink-0 items-center border-b-2 border-transparent px-3 font-mono text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground aria-selected:border-foreground aria-selected:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                {file.props['data-file']}
              </button>
            ))}
          </div>
          {running ? (
            <button
              type="button"
              onClick={stop}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition-[background-color,transform] duration-150 hover:bg-muted active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-ring"
            >
              <SquareIcon className="size-3 fill-current" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={run}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-foreground px-2.5 text-xs font-medium text-background transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {status._tag === 'Idle' ? (
                <PlayIcon className="size-3 fill-current" />
              ) : (
                <RotateCcwIcon className="size-3" />
              )}
              {status._tag === 'Idle' ? 'Run' : 'Run again'}
            </button>
          )}
        </div>
        {files.map((file, index) => (
          <div
            key={index}
            role="tabpanel"
            hidden={shown !== index}
            className="max-h-[26rem] overflow-auto [&>pre]:m-0 [&>pre]:rounded-none [&>pre]:border-0"
          >
            {file}
          </div>
        ))}
        <div className="border-t border-border bg-muted/20">
          <div className="flex h-8 items-center justify-between px-4 text-xs text-muted-foreground">
            <span className="font-medium">Console</span>
            <StatusLine status={status} />
          </div>
          <ol
            ref={output}
            aria-live="polite"
            className="max-h-72 min-h-24 overflow-auto border-t border-border/60 font-mono text-[12.5px] leading-5"
          >
            {lines.length === 0 && (
              <li className="px-4 py-3 font-sans text-sm text-muted-foreground">
                {status._tag === 'Idle'
                  ? 'Press Run, and what the program logs shows here.'
                  : running
                    ? 'Nothing logged yet.'
                    : 'Nothing was logged.'}
              </li>
            )}
            {lines.map((line) => (
              <LineRow key={line.id} line={line} />
            ))}
          </ol>
        </div>
      </div>
      {caption && (
        <figcaption className="mt-3 text-sm text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function StatusLine({ status }: { readonly status: Status }) {
  switch (status._tag) {
    case 'Idle':
      return null;
    case 'Running':
      return (
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" />
          Running
        </span>
      );
    case 'Done':
      return <span className="tabular-nums">Done in {seconds(status.ms)}</span>;
    case 'Stopped':
      return <span>Stopped</span>;
    case 'Failed':
      return <span className="text-red-600 dark:text-red-400">Failed</span>;
  }
}

const seconds = (ms: number) =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;

const KIND: Record<Kind, string> = {
  log: '',
  info: '',
  result: '',
  warn: 'bg-amber-500/8 text-amber-800 dark:text-amber-300',
  error: 'bg-red-500/8 text-red-700 dark:text-red-300',
};

function LineRow({ line }: { readonly line: Line }) {
  return (
    <li
      className={`grid grid-cols-[1rem_minmax(0,1fr)_auto] gap-2 border-b border-border/50 px-4 py-1 last:border-b-0 ${KIND[line.kind]}`}
    >
      <span aria-hidden className="text-muted-foreground select-none">
        {line.kind === 'result'
          ? '←'
          : line.kind === 'error'
            ? '✕'
            : line.kind === 'warn'
              ? '!'
              : '›'}
      </span>
      <span className="break-words whitespace-pre-wrap">
        {line.args.map((arg, index) => (
          <span key={index}>
            {index > 0 && ' '}
            {typeof arg === 'string' && line.kind !== 'result' ? (
              arg
            ) : (
              <Value value={arg} depth={0} />
            )}
          </span>
        ))}
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums select-none">
        +{(line.at / 1000).toFixed(2)}s
      </span>
    </li>
  );
}

const string = 'text-[#0a3069] dark:text-[#a5d6ff]';
const literal = 'text-[#0550ae] dark:text-[#79c0ff]';
const muted = 'text-muted-foreground';

/** A value as it reads in code, a tagged one as its tag and its fields. */
function Value({
  value,
  depth,
}: {
  readonly value: unknown;
  readonly depth: number;
}): ReactNode {
  if (typeof value === 'string')
    return <span className={string}>'{value}'</span>;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  )
    return <span className={literal}>{String(value)}</span>;
  if (value === null || value === undefined)
    return <span className={muted}>{String(value)}</span>;
  if (typeof value === 'function')
    return <span className={muted}>ƒ {value.name || 'anonymous'}</span>;
  if (value instanceof Error)
    return (
      <span>
        {value.name}: {value.message}
      </span>
    );
  if (depth > 3) return <span className={muted}>…</span>;
  if (Array.isArray(value))
    return (
      <span>
        [
        {value.map((item, index) => (
          <span key={index}>
            {index > 0 && ', '}
            <Value value={item} depth={depth + 1} />
          </span>
        ))}
        ]
      </span>
    );
  if (typeof value === 'object') {
    const { _tag, ...fields } = value as Record<string, unknown>;
    const entries = Object.entries(_tag === undefined ? value : fields);
    const tag =
      typeof _tag === 'string' ? (
        <span className="font-semibold text-foreground">{_tag}</span>
      ) : null;
    if (tag && entries.length === 0) return tag;
    return (
      <span>
        {tag}
        {tag && ' '}
        {'{ '}
        {entries.map(([key, item], index) => (
          <span key={key}>
            {index > 0 && ', '}
            <span className={muted}>{key}: </span>
            <Value value={item} depth={depth + 1} />
          </span>
        ))}
        {' }'}
      </span>
    );
  }
  return <span>{String(value)}</span>;
}
