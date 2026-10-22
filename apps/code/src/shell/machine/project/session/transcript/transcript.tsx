import {
  createContext,
  useContext,
  useMemo,
  type MouseEvent,
  type ReactNode,
} from 'react';
import type { Part, ToolKind, Usage } from '@kestack/ai-toolkit/api';
import {
  BotIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  CornerDownRightIcon,
  FilePenIcon,
  FilePlus2Icon,
  FileTextIcon,
  GitForkIcon,
  GlobeIcon,
  ListTodoIcon,
  PlugIcon,
  SearchIcon,
  SquareIcon,
  SquareTerminalIcon,
  Trash2Icon,
  TriangleAlertIcon,
  WrenchIcon,
  XIcon,
  ZapIcon,
} from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { DiffViewer } from '@kestack/web-platform/components/viewers/diff-viewer';
import { MarkdownViewer } from '@kestack/web-platform/components/viewers/markdown-viewer';
import { Attachments } from './attachments.tsx';
import type { Earlier } from './earlier.ts';
import { thread, type Row, type ToolState } from './thread.ts';
import {
  commandOf,
  diffsOf,
  groupTitle,
  grouped,
  reasonOf,
  relative,
  summary,
} from './tools.ts';

/*
 * Rows as a person reads them: what you asked, in a quiet block; the
 * agent's words as markdown, growing as they stream in, a quiet dot at
 * their end while more is on its way; each tool call as one line, a verb
 * and its target, its state at the end and, when it failed, why under it;
 * a run of calls of one kind as one line that opens to them; a subagent as
 * its own thread under its prompt, indented along a guide line, its report
 * last; and the end of each turn, quietly, with how long it took and,
 * on hover or focus, a way to fork the session there. A turn the agent
 * began on its own opens with a quiet line instead of your words. A Fork's
 * history before its Fork Point is one line, "Earlier in ‹title› · N
 * turns", that opens to those rows, then marks where it was forked.
 *
 * Every word can be selected: a line opens on a click that selected
 * nothing, or from its chevron, which is the button a keyboard reaches.
 */

type Call = Extract<Part, { readonly type: 'toolCall' }>;
type ToolRow = Extract<Row, { readonly kind: 'tool' }>;

/** The project's folder, so paths inside it read short. */
export const Folder = createContext<string | null>(null);

const TOOL_ICON: Record<ToolKind, typeof FileTextIcon> = {
  read: FileTextIcon,
  write: FilePlus2Icon,
  edit: FilePenIcon,
  delete: Trash2Icon,
  bash: SquareTerminalIcon,
  search: SearchIcon,
  web: GlobeIcon,
  subagent: BotIcon,
  todo: ListTodoIcon,
  mcp: PlugIcon,
  other: WrenchIcon,
};

export interface Opening {
  readonly isOpen: (id: string) => boolean;
  readonly toggle: (id: string) => void;
}

/** Forking the session after a finished turn. */
export interface Forking {
  readonly fork: (turnId: string) => void;
  /** The turn a fork is being made after, while it is. */
  readonly pending: string | null;
}

/** Output longer than this many lines shows its start until asked for all. */
const SHOWN_LINES = 12;

const compact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** The agent's words: prose, inline code as a quiet chip without the backticks prose adds. */
const prose =
  'prose-sm leading-7 prose-p:my-2 prose-pre:my-2 prose-code:rounded-[4px] prose-code:bg-muted prose-code:px-1 prose-code:py-px prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none';

/** A web link opens in a new tab; any other, as a file the agent named, goes nowhere. */
const onLinkClick = (href: string) => {
  if (/^https?:\/\//.test(href))
    window.open(href, '_blank', 'noopener,noreferrer');
  return true;
};

const usageLine = (usage: Usage) =>
  [
    `${compact.format(usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0))} in`,
    `${compact.format(usage.outputTokens)} out`,
    usage.costUsd !== undefined &&
      `$${usage.costUsd.toFixed(usage.costUsd < 0.1 ? 3 : 2)}`,
  ]
    .filter(Boolean)
    .join(' · ');

const took = (ms: number) => {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

/**
 * A click opens or closes, unless it ended a drag that selected text. A
 * double click selects a word: its second click undoes what its first did.
 */
const unlessSelecting =
  (toggle: () => void) => (event: MouseEvent<HTMLElement>) => {
    if (event.detail === 2) toggle();
    if (event.detail !== 1) return;
    if (window.getSelection()?.isCollapsed === false) return;
    toggle();
  };

/** More words on their way: a small dot, breathing unless motion is reduced. */
function Writing() {
  return (
    <span role="status" className="flex h-5 items-center">
      <span className="sr-only">Writing</span>
      <span
        aria-hidden
        className="size-1.5 animate-pulse rounded-full bg-muted-foreground/70 motion-reduce:animate-none"
      />
    </span>
  );
}

function State({ state }: { readonly state: ToolState }) {
  switch (state) {
    case 'running':
      return (
        <Spinner
          aria-label="Running"
          className="size-3.5 shrink-0 text-muted-foreground"
        />
      );
    case 'done':
      return (
        <CheckIcon
          aria-label="Done"
          className="size-3.5 shrink-0 text-muted-foreground/60"
        />
      );
    case 'failed':
      return (
        <XIcon
          aria-label="Failed"
          className="size-3.5 shrink-0 text-destructive"
        />
      );
    case 'stopped':
      return (
        <span className="shrink-0 text-xs text-muted-foreground">Stopped</span>
      );
  }
}

/** One line that opens what it holds: on a click that selected nothing, or from its chevron. */
function Line({
  id,
  opening,
  icon,
  title,
  hint,
  end,
  below,
  strong,
  children,
}: {
  readonly id: string;
  readonly opening: Opening;
  readonly icon: ReactNode;
  readonly title: ReactNode;
  /** The whole title, shown on hover when the line cuts it short. */
  readonly hint?: string;
  readonly end?: ReactNode;
  /** Shown under the line, open or not: why a call failed. */
  readonly below?: ReactNode;
  /** A subagent's line, which heads a block rather than sitting in one. */
  readonly strong?: boolean;
  readonly children: ReactNode;
}) {
  const open = opening.isOpen(id);
  const toggle = () => opening.toggle(id);
  return (
    <div className="flex flex-col">
      <div
        onClick={unlessSelecting(toggle)}
        className={`group -mx-2 flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none ${strong ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5">
          {icon}
        </span>
        <span title={hint} className="min-w-0 flex-1 truncate">
          {title}
        </span>
        {end}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Hide' : 'Show'} ${hint ?? 'details'}`}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          className="focus-ring -mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors duration-150 group-hover:text-foreground hover:bg-muted motion-reduce:transition-none"
        >
          <ChevronRightIcon
            aria-hidden
            className={`size-3.5 transition-[rotate] duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          />
        </button>
      </div>
      {below}
      {open && (
        <div className="mt-1 mb-3 flex flex-col gap-2 pl-6">{children}</div>
      )}
    </div>
  );
}

const block =
  'overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2.5 font-mono text-xs leading-5 whitespace-pre-wrap break-words';

/** Long text shows its first lines until asked for all of it. */
function Clamped({
  id,
  opening,
  text,
  children,
}: {
  readonly id: string;
  readonly opening: Opening;
  readonly text: string;
  /** Draws the text shown; plain by default. */
  readonly children?: (shown: string) => ReactNode;
}) {
  const all = text.replace(/\n+$/, '').split('\n');
  const whole = opening.isOpen(id) || all.length <= SHOWN_LINES + 2;
  const shown = whole ? all.join('\n') : all.slice(0, SHOWN_LINES).join('\n');
  return (
    <>
      {children ? children(shown) : shown}
      {all.length > SHOWN_LINES + 2 && (
        <button
          type="button"
          onClick={() => opening.toggle(id)}
          className="focus-ring mt-1.5 block cursor-pointer rounded-sm font-sans text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
        >
          {whole ? 'Show less' : `Show all ${all.length} lines`}
        </button>
      )}
    </>
  );
}

function Labelled({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** A call's input as JSON. */
const json = (input: unknown) =>
  typeof input === 'string' ? input : JSON.stringify(input, null, 2);

/** What a finished call gave back, or why it failed. */
function Output({
  row,
  opening,
  state,
}: {
  readonly row: ToolRow;
  readonly opening: Opening;
  readonly state: ToolState;
}) {
  if (!row.result) return null;
  const label =
    state === 'stopped' ? 'Stopped' : row.result.isError ? 'Error' : 'Output';
  return (
    <Labelled label={label}>
      <pre className={block}>
        <Clamped
          id={`${row.id}:all`}
          opening={opening}
          text={row.result.output || '(no output)'}
        />
      </pre>
      {row.result.truncated && (
        <span className="text-xs text-muted-foreground">Output cut short</span>
      )}
    </Labelled>
  );
}

type Todo = { readonly content: string; readonly status: string };

const todosOf = (call: Call): ReadonlyArray<Todo> | null => {
  const todos = (call.input as { todos?: unknown } | null)?.todos;
  if (!Array.isArray(todos)) return null;
  return todos.flatMap((todo: unknown) => {
    const { content, status } = (todo ?? {}) as Record<string, unknown>;
    return typeof content === 'string'
      ? [{ content, status: typeof status === 'string' ? status : '' }]
      : [];
  });
};

function Steps({ steps }: { readonly steps: ReadonlyArray<Todo> }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {steps.map((step, at) => (
        <li key={at} className="flex items-start gap-2">
          {step.status === 'completed' ? (
            <CheckIcon
              aria-hidden
              className="mt-1 size-3.5 shrink-0 text-muted-foreground"
            />
          ) : step.status === 'inProgress' || step.status === 'in_progress' ? (
            <CircleDotIcon
              aria-hidden
              className="mt-1 size-3.5 shrink-0 text-foreground"
            />
          ) : (
            <CircleIcon
              aria-hidden
              className="mt-1 size-3.5 shrink-0 text-muted-foreground"
            />
          )}
          <span
            className={
              step.status === 'completed'
                ? 'text-muted-foreground line-through decoration-border'
                : ''
            }
          >
            {step.content}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What a call did, opened: a command as a terminal, an edit as its diff, else its input and output. */
function Details({
  row,
  opening,
  state,
  folder,
}: {
  readonly row: ToolRow;
  readonly opening: Opening;
  readonly state: ToolState;
  readonly folder: string | null;
}) {
  const { call, result } = row;
  if (call.tool === 'bash')
    return (
      <pre className={block}>
        <span className="text-muted-foreground select-none">$ </span>
        <span className="text-foreground">{commandOf(call)}</span>
        {result && (
          <span className="mt-2 block text-muted-foreground">
            <Clamped
              id={`${row.id}:all`}
              opening={opening}
              text={result.output || '(no output)'}
            />
          </span>
        )}
        {result?.truncated && (
          <span className="mt-1 block font-sans text-muted-foreground">
            Output cut short
          </span>
        )}
      </pre>
    );
  const diffs = diffsOf(call, folder);
  if (diffs.length > 0)
    return (
      <>
        {diffs.map((diff) => (
          <DiffViewer
            key={diff.path}
            diff={diff as Parameters<typeof DiffViewer>[0]['diff']}
            defaultLayout="unified"
            autoHeight
            className="rounded-lg border border-border"
          />
        ))}
        {result?.isError && (
          <Output row={row} opening={opening} state={state} />
        )}
      </>
    );
  const todos = call.tool === 'todo' ? todosOf(call) : null;
  if (todos) return <Steps steps={todos} />;
  const content =
    call.tool === 'write'
      ? (call.input as { content?: unknown } | null)?.content
      : undefined;
  return (
    <>
      {typeof content === 'string' ? (
        <Labelled
          label={relative(
            String((call.input as { file_path?: unknown }).file_path ?? ''),
            folder,
          )}
        >
          <pre className={block}>
            <Clamped id={`${row.id}:input`} opening={opening} text={content} />
          </pre>
        </Labelled>
      ) : (
        call.tool !== 'read' && (
          <Labelled label={call.name}>
            <pre className={block}>
              <Clamped
                id={`${row.id}:input`}
                opening={opening}
                text={json(call.input)}
              />
            </pre>
          </Labelled>
        )
      )}
      <Output row={row} opening={opening} state={state} />
    </>
  );
}

function ToolLine({
  row,
  opening,
  running,
}: {
  readonly row: ToolRow;
  readonly opening: Opening;
  readonly running: boolean;
}) {
  const folder = useContext(Folder);
  const Icon = TOOL_ICON[row.call.tool];
  const state = row.state === 'running' && !running ? 'stopped' : row.state;
  const { verb, target, code, lines } = summary(row.call, state, folder);
  const reason =
    state === 'failed' && row.result ? reasonOf(row.result.output) : '';
  return (
    <Line
      id={row.id}
      opening={opening}
      icon={<Icon aria-hidden />}
      hint={`${verb} ${target}`.trim()}
      title={
        <>
          {verb && <span>{verb} </span>}
          <span
            className={`text-foreground/90 ${code ? 'font-mono text-[13px]' : ''}`}
          >
            {target}
          </span>
        </>
      }
      end={
        <>
          {lines && (lines.added > 0 || lines.removed > 0) && (
            <span className="shrink-0 font-mono text-xs tabular-nums">
              {lines.added > 0 && (
                <span className="text-positive">+{lines.added}</span>
              )}
              {lines.added > 0 && lines.removed > 0 && ' '}
              {lines.removed > 0 && (
                <span className="text-destructive">−{lines.removed}</span>
              )}
            </span>
          )}
          <State state={state} />
        </>
      }
      below={
        reason && (
          <p
            className="truncate pl-6 text-xs text-destructive/90"
            title={reason}
          >
            {reason}
          </p>
        )
      }
    >
      <Details row={row} opening={opening} state={state} folder={folder} />
    </Line>
  );
}

/** A run of calls of one kind, as one line: "Read 3 files", and what they were. */
function Group({
  id,
  rows,
  opening,
  running,
}: {
  readonly id: string;
  readonly rows: ReadonlyArray<ToolRow>;
  readonly opening: Opening;
  readonly running: boolean;
}) {
  const folder = useContext(Folder);
  const tool = rows[0]!.call.tool;
  const Icon = TOOL_ICON[tool];
  const states = rows.map((row) =>
    row.state === 'running' && !running ? 'stopped' : row.state,
  );
  const failed = states.filter((state) => state === 'failed').length;
  const targets = rows
    .map((row) => summary(row.call, 'done', folder).target)
    .join(', ');
  return (
    <Line
      id={id}
      opening={opening}
      icon={<Icon aria-hidden />}
      hint={`${groupTitle(rows)}: ${targets}`}
      title={
        <>
          <span className="text-foreground/90">{groupTitle(rows)}</span>
          <span className="text-muted-foreground/70"> · {targets}</span>
        </>
      }
      end={
        states.includes('running') ? (
          <State state="running" />
        ) : failed > 0 ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-destructive">
            <XIcon aria-hidden className="size-3.5" />
            {failed} failed
          </span>
        ) : states.includes('stopped') ? (
          <State state="stopped" />
        ) : (
          <State state="done" />
        )
      }
    >
      <div className="-mt-1 flex flex-col">
        {rows.map((row) => (
          <ToolLine
            key={row.id}
            row={row}
            opening={opening}
            running={running}
          />
        ))}
      </div>
    </Line>
  );
}

/** Words that may run long: their start, until asked for all. */
function Long({
  id,
  opening,
  children,
}: {
  readonly id: string;
  readonly opening: Opening;
  readonly children: string;
}) {
  const long = children.length > 700 || children.split('\n').length > 10;
  const whole = !long || opening.isOpen(id);
  return (
    <div className="flex flex-col items-start">
      <div
        className={
          whole
            ? 'w-full'
            : 'max-h-44 w-full overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]'
        }
      >
        <MarkdownViewer
          className={`${prose} text-sm`}
          onLinkClick={onLinkClick}
        >
          {children}
        </MarkdownViewer>
      </div>
      {long && (
        <button
          type="button"
          onClick={() => opening.toggle(id)}
          className="focus-ring mt-1 cursor-pointer rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground"
        >
          {whole ? 'Show less' : 'Show all'}
        </button>
      )}
    </div>
  );
}

function RowView({
  row,
  opening,
  running,
  nested,
  forking,
}: {
  readonly row: Row;
  readonly opening: Opening;
  readonly running: boolean;
  readonly nested: boolean;
  readonly forking: Forking | undefined;
}) {
  switch (row.kind) {
    case 'turn':
      if (row.agentStarted)
        return (
          <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground first:mt-0">
            <ZapIcon aria-hidden className="size-3.5 shrink-0" />
            Background work finished; the agent carried on
            <span aria-hidden className="h-px flex-1 bg-border" />
          </div>
        );
      return (
        <div
          className={`flex flex-col gap-1.5 first:mt-0 ${row.steered ? 'mt-1' : 'mt-6'}`}
        >
          {row.steered && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CornerDownRightIcon aria-hidden className="size-3.5" />
              Steered
            </span>
          )}
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
            {row.text !== '' && (
              <div className="text-base leading-7 whitespace-pre-wrap break-words">
                {row.text}
              </div>
            )}
            <Attachments attachments={row.attachments} />
          </div>
        </div>
      );
    case 'prompt':
      return (
        <div className="flex flex-col gap-1 py-1">
          <span className="text-xs font-medium text-muted-foreground">
            Prompt
          </span>
          <div className="text-sm leading-6 text-muted-foreground [&_.prose]:text-muted-foreground">
            <Long id={`${row.id}:all`} opening={opening}>
              {row.text}
            </Long>
          </div>
        </div>
      );
    case 'text': {
      // While it streams, its newest block fades in; a block that grows stays put.
      const writing = row.writing && running;
      return (
        <div className="flex flex-col">
          <MarkdownViewer
            className={`${prose} ${nested ? 'text-sm' : 'text-base'} ${writing ? '[&>:last-child]:animate-chunk-in motion-reduce:[&>:last-child]:animate-none' : ''}`}
            onLinkClick={onLinkClick}
          >
            {row.text}
          </MarkdownViewer>
          {writing && <Writing />}
        </div>
      );
    }
    case 'reasoning':
      return (
        <Line
          id={row.id}
          opening={opening}
          icon={<CircleDashedIcon aria-hidden />}
          title={
            <span className="italic">
              {row.writing && running ? 'Thinking' : 'Thought'}
            </span>
          }
          end={row.writing && running ? <Writing /> : undefined}
        >
          <p className="text-sm leading-6 whitespace-pre-wrap text-muted-foreground">
            {row.text}
          </p>
        </Line>
      );
    case 'tool':
      return <ToolLine row={row} opening={opening} running={running} />;
    case 'subagent': {
      const open = !opening.isOpen(row.id);
      const state = row.state === 'running' && !running ? 'stopped' : row.state;
      const title = row.call.title || 'Subagent';
      const started =
        row.result !== null || row.rows.some((each) => each.kind !== 'prompt');
      const toggle = () => opening.toggle(row.id);
      return (
        <div className="flex flex-col">
          <div
            onClick={unlessSelecting(toggle)}
            className="group -mx-2 flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none"
          >
            <BotIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 truncate" title={title}>
              <span className="text-muted-foreground">Subagent </span>
              <span className="font-medium">{title}</span>
            </span>
            <State state={state} />
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? 'Hide subagent' : 'Show subagent'}
              onClick={(event) => {
                event.stopPropagation();
                toggle();
              }}
              className="focus-ring -mr-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors duration-150 group-hover:text-foreground hover:bg-muted motion-reduce:transition-none"
            >
              <ChevronRightIcon
                aria-hidden
                className={`size-3.5 transition-[rotate] duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
              />
            </button>
          </div>
          {open && (
            <div className="mt-1 mb-2 ml-[7px] flex flex-col gap-2 border-l border-border pl-4">
              <Rows
                rows={row.rows}
                opening={opening}
                running={running}
                nested
              />
              {!started && (
                <p className="py-1 text-sm text-muted-foreground">
                  {state === 'running' ? 'Starting…' : 'Nothing was recorded'}
                </p>
              )}
              {row.result && (
                <div className="flex flex-col gap-1 pt-1">
                  <span
                    className={`flex items-center gap-1.5 text-xs font-medium ${row.result.isError ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    {row.result.isError ? (
                      <CircleAlertIcon aria-hidden className="size-3.5" />
                    ) : (
                      <CheckIcon aria-hidden className="size-3.5" />
                    )}
                    {row.result.isError ? 'It failed' : 'Its report'}
                  </span>
                  <Long id={`${row.id}:report`} opening={opening}>
                    {row.result.output}
                  </Long>
                  {row.result.truncated && (
                    <span className="text-xs text-muted-foreground">
                      Report cut short
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }
    case 'ended':
      return (
        <div
          className={`group/ended flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-xs tabular-nums ${row.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {row.status === 'done' && (
            <span className="flex items-center gap-1.5">
              <CheckIcon aria-hidden className="size-3.5" />
              {row.duration === null ? 'Done' : `Done in ${took(row.duration)}`}
            </span>
          )}
          {row.status === 'cancelled' && (
            <span className="flex items-center gap-1.5 font-medium text-foreground/80">
              <SquareIcon aria-hidden className="size-3 fill-current" />
              {row.duration === null
                ? 'Stopped'
                : `Stopped after ${took(row.duration)}`}
            </span>
          )}
          {row.status === 'interrupted' && (
            <span className="flex items-center gap-1.5 font-medium text-warning">
              <TriangleAlertIcon aria-hidden className="size-3.5" />
              Interrupted: the server stopped while this ran
            </span>
          )}
          {row.status === 'failed' && (
            <span className="flex items-center gap-1.5 font-medium">
              <CircleAlertIcon aria-hidden className="size-3.5" />
              {row.duration === null
                ? 'Failed'
                : `Failed after ${took(row.duration)}`}
              {row.error && <span className="font-normal">: {row.error}</span>}
            </span>
          )}
          {row.usage && <span aria-hidden>·</span>}
          {row.usage && <span>{usageLine(row.usage)}</span>}
          {forking && (
            <ForkHere
              pending={forking.pending === row.turnId}
              busy={forking.pending !== null}
              onFork={() => forking.fork(row.turnId)}
            />
          )}
        </div>
      );
    case 'error':
      return (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{row.message}</span>
        </p>
      );
    case 'plan':
      return (
        <Steps
          steps={row.steps.map(({ step, status }) => ({
            content: step,
            status,
          }))}
        />
      );
    case 'note':
      return <p className="text-xs text-muted-foreground">{row.label}</p>;
  }
}

/** Forks after this turn: shown on hover or focus of its end, always on a touch screen. */
function ForkHere({
  pending,
  busy,
  onFork,
}: {
  readonly pending: boolean;
  readonly busy: boolean;
  readonly onFork: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onFork}
      className={`focus-ring ml-auto inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground transition-[opacity,color,background-color] duration-150 hover:bg-muted hover:text-foreground focus-visible:opacity-100 disabled:cursor-default group-hover/ended:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100 ${pending ? 'opacity-100' : 'opacity-0'}`}
    >
      {pending ? (
        <Spinner className="size-3.5" />
      ) : (
        <GitForkIcon aria-hidden className="size-3.5" />
      )}
      Fork from here
    </button>
  );
}

export function Rows({
  rows,
  opening,
  running,
  nested = false,
  forking,
}: {
  readonly rows: ReadonlyArray<Row>;
  readonly opening: Opening;
  /** Whether the session runs: a call left without a result while it does not was stopped. */
  readonly running: boolean;
  /** Inside a subagent, whose words are a step smaller than the main agent's. */
  readonly nested?: boolean;
  /** How to fork after a finished turn; a subagent's thread has no turns of its own. */
  readonly forking?: Forking;
}) {
  return grouped(rows).map((item) =>
    item.kind === 'group' ? (
      <Group
        key={item.id}
        id={item.id}
        rows={item.rows}
        opening={opening}
        running={running}
      />
    ) : (
      <RowView
        key={item.row.id}
        row={item.row}
        opening={opening}
        running={running}
        nested={nested}
        forking={forking}
      />
    ),
  );
}

/** What a Fork carries on from, folded into one line until opened. */
export function EarlierRows({
  title,
  earlier,
  opening,
  forking,
}: {
  /** The title of the Session forked. */
  readonly title: string;
  readonly earlier: Earlier;
  readonly opening: Opening;
  readonly forking?: Forking;
}) {
  const rows = useMemo(
    () => (earlier._tag === 'Read' ? thread(earlier.messages) : []),
    [earlier],
  );
  if (earlier._tag === 'Missing') return null;
  const id = 'earlier';
  const open = earlier._tag === 'Read' && opening.isOpen(id);
  const turns =
    earlier._tag === 'Read'
      ? ` · ${earlier.turns} turn${earlier.turns === 1 ? '' : 's'}`
      : '';
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        disabled={earlier._tag !== 'Read'}
        onClick={() => opening.toggle(id)}
        className="focus-ring group -mx-2 flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-muted-foreground motion-reduce:transition-none"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          {earlier._tag === 'Reading' ? (
            <Spinner className="size-3.5" />
          ) : (
            <ChevronRightIcon
              aria-hidden
              className={`size-3.5 transition-[rotate] duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
            />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate">
          Earlier in <span className="text-foreground/80">{title}</span>
          <span className="tabular-nums">{turns}</span>
        </span>
      </button>
      {open && (
        <>
          <Rows
            rows={rows}
            opening={opening}
            running={false}
            forking={forking}
          />
          <div
            role="separator"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <GitForkIcon aria-hidden className="size-3.5 shrink-0" />
            Forked here
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
    </div>
  );
}
