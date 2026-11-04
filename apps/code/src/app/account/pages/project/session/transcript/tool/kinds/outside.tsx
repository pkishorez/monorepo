import {
  ArrowUpRightIcon,
  GlobeIcon,
  MessageCircleQuestionMarkIcon,
  PlugIcon,
  ListTodoIcon,
  WrenchIcon,
} from 'lucide-react';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { type Kind, Output, Block, json, Labelled } from '../output/index.ts';
import { askedOf, type Asked as Read } from '../parse/index.ts';
import { Clamped, Checklist } from '../../words/index.ts';
import type { Row, ToolState } from '../../turns/rows/index.ts';

/*
 * Tools that reach past the files: the web, a connected server, the
 * agent's own to-do list, a question it asked you, and any tool not
 * modelled yet.
 */

/** A page fetched, or the web searched: opened, a link to the page, and what came back. */
export const web: Kind = {
  icon: GlobeIcon,
  Detail: ({ row, opening }) => {
    const url = (row.call.input as { url?: unknown } | null)?.url;
    return (
      <>
        {typeof url === 'string' && /^https?:\/\//.test(url) && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex min-h-11 max-w-full items-center gap-1 self-start rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground hover:decoration-foreground keyboard:min-h-0"
          >
            <span className="truncate">{url}</span>
            <ArrowUpRightIcon aria-hidden className="size-3 shrink-0" />
          </a>
        )}
        <Output
          row={row}
          opening={opening}
          label={typeof url === 'string' ? 'What the page said' : 'Results'}
        />
      </>
    );
  },
};

/** `mcp__linear__save_comment` as its server and its tool. */
const named = (name: string) => {
  const [, server, ...tool] = name.split('__');
  return server && tool.length > 0 ? `${server} · ${tool.join('__')}` : name;
};

/** A tool of a connected server: opened, what it was asked and what it answered. */
export const mcp: Kind = {
  icon: PlugIcon,
  Detail: ({ row, opening }) => (
    <>
      <Labelled label={named(row.call.name)}>
        <Block>
          <Clamped
            id={`${row.id}:input`}
            opening={opening}
            text={json(row.call.input)}
          />
        </Block>
      </Labelled>
      <Output row={row} opening={opening} label="Its answer" />
    </>
  ),
};

/** The agent's to-do list, as it wrote it: opened, each step and where it stands. */
export const todo: Kind = {
  icon: ListTodoIcon,
  Detail: ({ row, opening }) => {
    const todos = (row.call.input as { todos?: unknown } | null)?.todos;
    if (!Array.isArray(todos)) return <Output row={row} opening={opening} />;
    return (
      <Checklist
        steps={todos.flatMap((todo: unknown) => {
          const { content, status } = (todo ?? {}) as Record<string, unknown>;
          return typeof content === 'string'
            ? [
                {
                  text: content,
                  status: typeof status === 'string' ? status : '',
                },
              ]
            : [];
        })}
      />
    );
  },
};

/** Each question asked under its header, and what was answered, a secret hidden. */
function Answers({ asked }: { readonly asked: ReadonlyArray<Read> }) {
  return (
    <dl className="flex flex-col gap-2.5">
      {asked.map(({ header, question, secret, answer }, at) => (
        <div key={at} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-sm text-muted-foreground">
            {header !== '' && (
              <span className="font-medium text-foreground/80">
                {header} ·{' '}
              </span>
            )}
            {question}
          </dt>
          <dd
            className={
              answer === null
                ? 'text-sm text-muted-foreground/70'
                : 'text-sm break-words text-foreground'
            }
          >
            {answer === null ? '—' : secret ? '••••••••' : answer.join(', ')}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A question the agent asked you: opened, each question and its answer. */
export const question: Kind = {
  icon: MessageCircleQuestionMarkIcon,
  Detail: ({ row, opening }) => {
    const read = askedOf(row.call, row.answered);
    return read === null ? (
      <Output row={row} opening={opening} />
    ) : (
      <Answers asked={read.asked} />
    );
  },
};

/**
 * A question the agent asked you, as the conversation reads it, never
 * folded into its work, a card as a subagent's is: where it stands, as
 * its title, how many questions, then each and what was answered; while
 * its Turn waits, that it waits for you; skipped or left, that it was.
 * Null when its input holds no question, for a tool line instead.
 */
export function Asked({
  row,
  state,
}: {
  readonly row: Extract<Row, { readonly kind: 'tool' }>;
  readonly state: ToolState;
}) {
  const read = askedOf(row.call, row.answered);
  if (read === null) return null;
  const said =
    state === 'running'
      ? 'Waiting for your answer'
      : state === 'stopped'
        ? 'Asked, not answered'
        : read.declined
          ? 'Asked, and skipped'
          : 'Asked you';
  const count = read.asked.length;
  return (
    <div className="my-1.5 flex w-full max-w-xl min-w-0 flex-col rounded-xl border border-border">
      <div className="flex min-h-12 items-center gap-2.5 px-3 text-sm keyboard:min-h-10">
        <MessageCircleQuestionMarkIcon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 flex-1 truncate font-medium">{said}</span>
        {state === 'running' ? (
          <Spinner
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {count === 1 ? 'One question' : `${count} questions`}
          </span>
        )}
      </div>
      <div className="min-w-0 border-t border-border/70 px-3 py-2.5">
        <Answers asked={read.asked} />
      </div>
    </div>
  );
}

/** Any tool not modelled yet: opened, its input as given and its output. */
export const other: Kind = {
  icon: WrenchIcon,
  Detail: ({ row, opening }) => (
    <>
      <Labelled label={row.call.name}>
        <Block>
          <Clamped
            id={`${row.id}:input`}
            opening={opening}
            text={json(row.call.input)}
          />
        </Block>
      </Labelled>
      <Output row={row} opening={opening} />
    </>
  ),
};
