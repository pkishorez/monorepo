import type { Schema } from 'effect';
import type {
  Part,
  Projected,
  Role,
  ToolKind,
  TurnEndStatus,
} from '../../../projection/index.js';
import type { Raw } from '../../../raw/index.js';
import type {
  Notifications,
  ThreadItem,
  TurnStatus,
} from '../app-server/index.js';
import {
  isToolItem,
  TEXT_CHUNK,
  type Channel,
  type ToolItem,
} from '../thread/index.js';

/** Tool output longer than this is cut in the projection; Raw keeps it all. */
export const OUTPUT_LIMIT = 4_000;
const TITLE_LIMIT = 80;

type Payload<M extends keyof Notifications> = Notifications[M];

const TURN_END: Record<TurnStatus, TurnEndStatus> = {
  completed: 'done',
  interrupted: 'cancelled',
  failed: 'failed',
  inProgress: 'failed',
};

const json = (value: unknown): Schema.Json => (value ?? null) as Schema.Json;

/**
 * An error as a person reads it: Codex passes a provider's rejection on as
 * its JSON body (`{"type":"error","status":400,"error":{"message":…}}`).
 */
export const readableError = (message: string): string => {
  let body: unknown;
  try {
    body = JSON.parse(message);
  } catch {
    return message;
  }
  const inner = (body as { error?: { message?: unknown } } | null)?.error
    ?.message;
  return typeof inner === 'string' && inner !== '' ? inner : message;
};

const firstLine = (value: string): string => {
  const line = value.trim().split('\n')[0] ?? '';
  return line.length > TITLE_LIMIT
    ? `${line.slice(0, TITLE_LIMIT - 1)}…`
    : line;
};

const trimmed = (output: string) =>
  output.length > OUTPUT_LIMIT
    ? { output: output.slice(0, OUTPUT_LIMIT), truncated: true }
    : { output, truncated: false };

/** `/bin/zsh -lc 'pnpm test'` reads as `pnpm test`. */
const shellCommand = (command: string): string => {
  const wrapped = /^\S*\b(?:ba|z)?sh -lc (['"])([\s\S]*)\1$/.exec(command);
  if (wrapped === null) return command;
  const inner = wrapped[2] ?? '';
  return wrapped[1] === "'" ? inner.replaceAll(`'\\''`, `'`) : inner;
};

const message = (
  raw: Raw,
  role: Role,
  parts: ReadonlyArray<Part>,
): Projected => ({ agentId: raw.agentId, role, parts });

const fileChangeKind = (
  item: Extract<ThreadItem, { type: 'fileChange' }>,
): ToolKind => {
  const kinds = new Set(item.changes.map((change) => change.kind.type));
  if (kinds.size === 1 && kinds.has('add')) return 'write';
  if (kinds.size === 1 && kinds.has('delete')) return 'delete';
  return 'edit';
};

/** A long path keeps its end, where the file name is. */
const pathTitle = (path: string): string =>
  path.length > TITLE_LIMIT ? `…${path.slice(-(TITLE_LIMIT - 1))}` : path;

const pathsTitle = (paths: ReadonlyArray<string>): string =>
  paths.length <= 1
    ? pathTitle(paths[0] ?? '')
    : `${pathTitle(paths[0] ?? '')} +${paths.length - 1} more`;

const webTitle = (item: Extract<ThreadItem, { type: 'webSearch' }>): string => {
  const action = item.action;
  if (action?.type === 'openPage' || action?.type === 'findInPage')
    return firstLine(action.url ?? item.query);
  return firstLine(item.query);
};

const toolCall = (item: ToolItem): Extract<Part, { type: 'toolCall' }> => {
  const call = (
    tool: ToolKind,
    name: string,
    title: string,
    input: unknown,
  ) => ({
    type: 'toolCall' as const,
    id: item.id,
    tool,
    name,
    title,
    input: json(input),
  });
  switch (item.type) {
    case 'commandExecution':
      return call('bash', item.type, firstLine(shellCommand(item.command)), {
        command: item.command,
        cwd: item.cwd,
      });
    case 'fileChange':
      return call(
        fileChangeKind(item),
        item.type,
        pathsTitle(item.changes.map((change) => change.path)),
        { changes: item.changes },
      );
    case 'mcpToolCall':
      return call(
        'mcp',
        `${item.server}/${item.tool}`,
        `${item.server}/${item.tool}`,
        item.arguments,
      );
    case 'dynamicToolCall':
      return call('other', item.tool, item.tool, item.arguments);
    case 'collabAgentToolCall':
      return item.tool === 'spawnAgent'
        ? call('subagent', item.tool, firstLine(item.prompt ?? 'Sub-agent'), {
            prompt: item.prompt,
            model: item.model,
          })
        : call('other', item.tool, collabTitle(item), {
            receiverThreadIds: item.receiverThreadIds,
            prompt: item.prompt,
          });
    case 'webSearch':
      return call('web', item.type, webTitle(item), {
        query: item.query,
        action: item.action,
      });
    case 'imageView':
      return call('read', item.type, pathTitle(item.path), { path: item.path });
    case 'imageGeneration':
      return call('other', item.type, 'Generate image', {});
  }
};

const collabTitle = (
  item: Extract<ThreadItem, { type: 'collabAgentToolCall' }>,
): string => {
  const agents = item.receiverThreadIds.length;
  const target = agents === 1 ? '1 agent' : `${agents} agents`;
  return item.prompt === null
    ? `${item.tool} ${target}`
    : `${item.tool}: ${firstLine(item.prompt)}`;
};

const mcpOutput = (
  item: Extract<ThreadItem, { type: 'mcpToolCall' }>,
): string => {
  if (item.error !== null) return item.error.message;
  return (item.result?.content ?? [])
    .map((block) => {
      const { type, text } = (block ?? {}) as { type?: string; text?: string };
      return type === 'text' && text !== undefined
        ? text
        : JSON.stringify(block);
    })
    .join('\n');
};

/** The result of a finished tool item: its output and whether it failed. */
const toolResult = (
  item: ToolItem,
): { output: string; isError: boolean } | null => {
  switch (item.type) {
    case 'commandExecution':
      return {
        output: item.aggregatedOutput ?? '',
        isError:
          item.status !== 'completed' ||
          (item.exitCode !== null && item.exitCode !== 0),
      };
    case 'fileChange':
      return {
        output: item.changes.map((change) => change.diff).join('\n'),
        isError: item.status !== 'completed',
      };
    case 'mcpToolCall':
      return { output: mcpOutput(item), isError: item.status !== 'completed' };
    case 'dynamicToolCall':
      return {
        output: JSON.stringify(item.contentItems ?? []),
        isError: item.status !== 'completed' || item.success === false,
      };
    case 'collabAgentToolCall': {
      // A spawn's result is its sub-agent's own finished turn, not the spawn.
      if (item.tool === 'spawnAgent' && item.status === 'completed')
        return null;
      const states = Object.entries(item.agentsStates).map(
        ([thread, state]) =>
          `${thread}: ${state?.status ?? 'unknown'}${state?.message ? `\n${state.message}` : ''}`,
      );
      return {
        output: states.join('\n'),
        isError: item.status !== 'completed',
      };
    }
    case 'webSearch':
      return { output: item.query, isError: false };
    case 'imageView':
      return { output: item.path, isError: false };
    case 'imageGeneration':
      return { output: '', isError: false };
  }
};

const completedItem = (raw: Raw, item: ThreadItem): Projected | null => {
  if (isToolItem(item)) {
    const result = toolResult(item);
    if (result === null) return null;
    return message(raw, 'tool', [
      {
        type: 'toolResult',
        toolCallId: item.id,
        ...trimmed(result.output),
        isError: result.isError,
      },
    ]);
  }
  switch (item.type) {
    // Text that streamed is stored as pointers to its text.chunk records,
    // which show it; only text that never streamed is shown from here.
    case 'agentMessage':
    case 'plan':
      return typeof item.text !== 'string' || item.text.trim() === ''
        ? null
        : message(raw, 'assistant', [{ type: 'text', text: item.text }]);
    case 'reasoning': {
      const text = [...item.summary, ...item.content]
        .filter((part) => typeof part === 'string')
        .join('\n\n')
        .trim();
      return text === ''
        ? null
        : message(raw, 'assistant', [{ type: 'reasoning', text }]);
    }
    case 'userMessage': {
      // The main agent's user text is the engine's own turn.started record;
      // a sub-agent's is the prompt it was spawned with.
      if (raw.agentId === null) return null;
      const text = item.content
        .flatMap((input) => (input.text === undefined ? [] : [input.text]))
        .join('\n');
      return text === ''
        ? null
        : message(raw, 'user', [{ type: 'text', text }]);
    }
    case 'contextCompaction':
      return message(raw, 'system', [
        { type: 'other', label: 'Context compacted' },
      ]);
    case 'enteredReviewMode':
      return message(raw, 'system', [
        { type: 'other', label: 'Review started' },
      ]);
    case 'exitedReviewMode':
      return message(raw, 'system', [
        { type: 'other', label: 'Review finished' },
      ]);
    default:
      return null;
  }
};

const lastAgentText = (items: ReadonlyArray<ThreadItem>): string => {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (item?.type === 'agentMessage') return item.text;
  }
  return '';
};

const turnCompleted = (
  raw: Raw,
  params: Payload<'turn/completed'>,
): Projected => {
  const { turn } = params;
  if (raw.agentId !== null) {
    // A sub-agent finishing its turn is the result of the call that spawned it.
    const output =
      turn.error === null
        ? lastAgentText(turn.items)
        : readableError(turn.error.message);
    return message(raw, 'tool', [
      {
        type: 'toolResult',
        toolCallId: raw.agentId,
        ...trimmed(output),
        isError: turn.status !== 'completed',
      },
    ]);
  }
  const status = TURN_END[turn.status];
  return message(raw, 'system', [
    {
      type: 'turnEnded',
      status,
      ...(turn.error === null
        ? {}
        : { error: readableError(turn.error.message) }),
    },
  ]);
};

/** Pure: one Raw record this harness wrote, to its projected form or null. */
export const project = (raw: Raw): Projected | null => {
  switch (raw.kind) {
    case 'item/started': {
      const { item } = raw.payload as unknown as Payload<'item/started'>;
      return isToolItem(item)
        ? message(raw, 'assistant', [toolCall(item)])
        : null;
    }
    case 'item/completed':
      return completedItem(
        raw,
        (raw.payload as unknown as Payload<'item/completed'>).item,
      );
    case TEXT_CHUNK: {
      const { streamId, channel, text } = raw.payload as {
        streamId: string;
        channel: Channel;
        text: string;
      };
      return message(raw, 'assistant', [
        { type: 'textChunk', streamId, channel, text },
      ]);
    }
    case 'turn/plan/updated': {
      const { plan } = raw.payload as unknown as Payload<'turn/plan/updated'>;
      return message(raw, 'assistant', [
        {
          type: 'codex.plan',
          steps: plan.map(({ step, status }) => ({ step, status })),
        },
      ]);
    }
    case 'turn/completed':
      return turnCompleted(
        raw,
        raw.payload as unknown as Payload<'turn/completed'>,
      );
    case 'error': {
      const { error, willRetry } = raw.payload as unknown as Payload<'error'>;
      const text = readableError(error.message);
      return message(raw, 'system', [
        {
          type: 'error',
          message: willRetry ? `${text} (retrying)` : text,
        },
      ]);
    }
    case 'thread/tokenUsage/updated': {
      const { last } = (
        raw.payload as unknown as Payload<'thread/tokenUsage/updated'>
      ).tokenUsage;
      return message(raw, 'system', [
        {
          type: 'usage',
          usage: {
            inputTokens: last.inputTokens,
            outputTokens: last.outputTokens,
            cacheReadTokens: last.cachedInputTokens,
          },
        },
      ]);
    }
    default:
      // Anything newer: kept in Raw, not shown.
      return null;
  }
};
