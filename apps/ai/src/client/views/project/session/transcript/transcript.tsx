import type { ReactNode } from 'react';
import type { ToolKind, Usage } from '@kestack/ai-toolkit/api';
import {
  BotIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  FilePenIcon,
  FilePlus2Icon,
  FileTextIcon,
  GlobeIcon,
  ListTodoIcon,
  PlugIcon,
  SearchIcon,
  SquareIcon,
  SquareTerminalIcon,
  Trash2Icon,
  WrenchIcon,
  XIcon,
} from '@kestack/web-platform/components/lucide';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { MarkdownViewer } from '@kestack/web-platform/components/viewers/markdown-viewer';
import type { Row, ToolState } from './thread.ts';

/*
 * Rows as a person reads them: what you asked, in a quiet block; the
 * agent's words as markdown; its thinking and its tool calls as one muted
 * line each, opened on a click; a subagent as its own thread, indented
 * along a guide line; and the end of each turn, quietly, unless it was
 * stopped or failed.
 */

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

const compact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** The agent's words: prose, inline code as a quiet chip without the backticks prose adds. */
const prose =
  'prose-sm leading-relaxed prose-p:my-2 prose-pre:my-2 prose-code:rounded-[4px] prose-code:bg-muted prose-code:px-1 prose-code:py-px prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none';

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

function State({ state }: { readonly state: ToolState }) {
  switch (state) {
    case 'running':
      return (
        <Spinner
          aria-label="Running"
          className="size-3.5 text-muted-foreground"
        />
      );
    case 'done':
      return (
        <CheckIcon
          aria-label="Done"
          className="size-3.5 text-muted-foreground"
        />
      );
    case 'failed':
      return (
        <XIcon aria-label="Failed" className="size-3.5 text-destructive" />
      );
    case 'stopped':
      return <span className="text-xs text-muted-foreground">Stopped</span>;
  }
}

/** One quiet line that opens what it holds. */
function Line({
  id,
  opening,
  icon,
  title,
  end,
  mono,
  children,
}: {
  readonly id: string;
  readonly opening: Opening;
  readonly icon: ReactNode;
  readonly title: ReactNode;
  readonly end?: ReactNode;
  readonly mono?: boolean;
  readonly children: ReactNode;
}) {
  const open = opening.isOpen(id);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => opening.toggle(id)}
        className="group -mx-2 flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground transition-colors duration-150 outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5">
          {icon}
        </span>
        <span
          className={`min-w-0 flex-1 truncate ${mono ? 'font-mono text-[13px]' : ''}`}
        >
          {title}
        </span>
        {end}
        <ChevronRightIcon
          aria-hidden
          className={`size-3.5 shrink-0 opacity-0 transition-[opacity,rotate] duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 ${open ? 'rotate-90 opacity-100' : ''}`}
        />
      </button>
      {open && (
        <div className="mt-1 mb-2 flex flex-col gap-2 pl-6">{children}</div>
      )}
    </div>
  );
}

function Code({
  label,
  children,
  note,
}: {
  readonly label: string;
  readonly children: string;
  readonly note?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
        {children}
      </pre>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

const inputText = (input: unknown) =>
  typeof input === 'string' ? input : JSON.stringify(input, null, 2);

function RowView({
  row,
  opening,
  running,
}: {
  readonly row: Row;
  readonly opening: Opening;
  readonly running: boolean;
}) {
  switch (row.kind) {
    case 'turn':
      return (
        <div
          className={`flex flex-col gap-1 first:mt-0 ${row.steered ? 'mt-1' : 'mt-6'}`}
        >
          {row.steered && (
            <span className="text-xs font-medium text-signal">Steered</span>
          )}
          <div
            className={`rounded-lg bg-muted/70 px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${row.steered ? 'border-l-2 border-signal' : ''}`}
          >
            {row.text}
          </div>
        </div>
      );
    case 'prompt':
      return (
        <Line
          id={row.id}
          opening={opening}
          icon={<CircleIcon aria-hidden />}
          title={<>Prompt: {row.text.split('\n')[0]}</>}
        >
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {row.text}
          </p>
        </Line>
      );
    case 'text':
      return (
        <MarkdownViewer
          className={`${prose} text-[15px]`}
          onLinkClick={onLinkClick}
        >
          {row.text}
        </MarkdownViewer>
      );
    case 'reasoning':
      return (
        <Line
          id={row.id}
          opening={opening}
          icon={<CircleDashedIcon aria-hidden />}
          title={<span className="italic">Thinking</span>}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {row.text}
          </p>
        </Line>
      );
    case 'tool': {
      const Icon = TOOL_ICON[row.call.tool];
      const state = row.state === 'running' && !running ? 'stopped' : row.state;
      return (
        <Line
          id={row.id}
          opening={opening}
          icon={<Icon aria-hidden />}
          title={row.call.title || row.call.name}
          mono={row.call.tool === 'bash'}
          end={<State state={state} />}
        >
          <Code label={row.call.name}>{inputText(row.call.input)}</Code>
          {row.result && (
            <Code
              label={
                state === 'stopped'
                  ? 'Stopped'
                  : row.result.isError
                    ? 'Error'
                    : 'Output'
              }
              note={row.result.truncated ? 'Output truncated' : undefined}
            >
              {row.result.output || '(no output)'}
            </Code>
          )}
        </Line>
      );
    }
    case 'subagent': {
      const open = !opening.isOpen(row.id);
      const state = row.state === 'running' && !running ? 'stopped' : row.state;
      return (
        <div className="flex flex-col">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => opening.toggle(row.id)}
            className="group -mx-2 flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-150 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BotIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              {row.call.title || 'Subagent'}
            </span>
            <State state={state} />
            <ChevronRightIcon
              aria-hidden
              className={`size-3.5 shrink-0 text-muted-foreground transition-[rotate] duration-150 ${open ? 'rotate-90' : ''}`}
            />
          </button>
          {open && (
            <div className="mt-1 ml-[7px] flex flex-col gap-2 border-l border-border pl-4">
              {row.rows.length === 0 ? (
                <p className="py-1 text-sm text-muted-foreground">
                  {state === 'running' ? 'Starting…' : 'Nothing was recorded'}
                </p>
              ) : (
                <Rows rows={row.rows} opening={opening} running={running} />
              )}
              {row.result && (
                <Line
                  id={`${row.id}:result`}
                  opening={opening}
                  icon={
                    row.result.isError ? (
                      <CircleAlertIcon aria-hidden />
                    ) : (
                      <CheckIcon aria-hidden />
                    )
                  }
                  title="What it reported"
                >
                  <MarkdownViewer
                    className={`${prose} text-sm`}
                    onLinkClick={onLinkClick}
                  >
                    {row.result.output}
                  </MarkdownViewer>
                  {row.result.truncated && (
                    <span className="text-xs text-muted-foreground">
                      Output truncated
                    </span>
                  )}
                </Line>
              )}
            </div>
          )}
        </div>
      );
    }
    case 'ended':
      return (
        <div
          className={`flex items-center gap-2 text-xs ${row.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {row.status === 'cancelled' && (
            <span className="flex items-center gap-1.5 font-medium text-foreground/80">
              <SquareIcon aria-hidden className="size-3 fill-current" /> Stopped
            </span>
          )}
          {row.status === 'failed' && (
            <span className="flex items-center gap-1.5 font-medium">
              <CircleAlertIcon aria-hidden className="size-3.5" /> Failed
              {row.error && <span className="font-normal">: {row.error}</span>}
            </span>
          )}
          {row.usage && (
            <span className="tabular-nums">
              {row.status !== 'done' && '· '}
              {usageLine(row.usage)}
            </span>
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
        <ul className="flex flex-col gap-1 text-sm">
          {row.steps.map((step, at) => (
            <li key={at} className="flex items-start gap-2">
              {step.status === 'completed' ? (
                <CheckIcon
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
              ) : step.status === 'inProgress' ||
                step.status === 'in_progress' ? (
                <CircleDotIcon
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 text-signal"
                />
              ) : (
                <CircleIcon
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                />
              )}
              <span
                className={
                  step.status === 'completed'
                    ? 'text-muted-foreground line-through decoration-border'
                    : ''
                }
              >
                {step.step}
              </span>
            </li>
          ))}
        </ul>
      );
    case 'note':
      return <p className="text-xs text-muted-foreground">{row.label}</p>;
  }
}

export function Rows({
  rows,
  opening,
  running,
}: {
  readonly rows: ReadonlyArray<Row>;
  readonly opening: Opening;
  /** Whether the session runs: a call left without a result while it does not was stopped. */
  readonly running: boolean;
}) {
  return rows.map((row) => (
    <RowView key={row.id} row={row} opening={opening} running={running} />
  ));
}
