import {
  ArrowUpRightIcon,
  GlobeIcon,
  PlugIcon,
  ListTodoIcon,
  WrenchIcon,
} from 'lucide-react';
import { type Kind, Output, Block, json, Labelled } from '../output/index.ts';
import { Clamped, Checklist } from '../../words/index.ts';

/*
 * Tools that reach past the files: the web, a connected server, the
 * agent's own to-do list, and any tool not modelled yet.
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
