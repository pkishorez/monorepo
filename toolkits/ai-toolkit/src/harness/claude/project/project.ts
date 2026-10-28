import { Option, Schema } from 'effect';
import type {
  Part,
  Projected,
  TurnEndStatus,
  Usage,
} from '../../../contract/projection/index.js';
import type { Raw } from '../../../contract/raw/index.js';
import {
  QuestionAnswerSchema,
  type QuestionAnswer,
} from '../../../contract/wire/index.js';
import { toolKind, toolTitle } from './tools.js';

/**
 * The record the harness writes as the user answers or declines an Agent
 * Question, into its Turn. Claude Code keeps what was chosen only as it
 * told the agent, each Item's choices joined into one string, so the
 * harness records the answer as it gave it.
 */
export const QUESTION_ANSWERED = 'question.answered';

/** What `question.answered` holds: null answers, the user declined. */
export type QuestionAnswered = {
  /** The `AskUserQuestion` call's tool_use id. */
  readonly toolUseId: string;
  readonly answers: QuestionAnswer | null;
};

/** Tool output longer than this is cut in the projection; Raw keeps all of it. */
export const TOOL_OUTPUT_MAX = 4000;

type Json = Raw['payload'];
type Obj = { readonly [key: string]: Json };

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const blocks = (message: unknown): ReadonlyArray<Obj> => {
  if (!isObj(message)) return [];
  const content = message['content'];
  return Array.isArray(content) ? content.filter(isObj) : [];
};

/**
 * A streamed text or thinking block holds a pointer to its `text.chunk`
 * records instead of its text, and shows nothing: its chunks show it. Only
 * a block that did not stream still has its text inline.
 */
const assistantParts = (payload: Obj): ReadonlyArray<Part> =>
  blocks(payload['message']).flatMap((block): ReadonlyArray<Part> => {
    const text = str(block['text']);
    const thinking = str(block['thinking']);
    switch (block['type']) {
      case 'text':
        return text?.trim() ? [{ type: 'text', text }] : [];
      case 'thinking':
        return thinking?.trim() ? [{ type: 'reasoning', text: thinking }] : [];
      case 'tool_use':
      case 'server_tool_use': {
        const name = str(block['name']) ?? 'unknown';
        const input = block['input'] ?? null;
        return [
          {
            type: 'toolCall',
            id: str(block['id']) ?? '',
            tool: toolKind(name),
            name,
            title: toolTitle(name, input),
            input,
          },
        ];
      }
      default:
        return [];
    }
  });

/** The note Claude Code adds after a subagent's report, for the model only. */
const SUBAGENT_NOTE = /^agentId: \S+ \(use SendMessage/;

const outputText = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content))
    return content == null ? '' : JSON.stringify(content);
  return content
    .filter(
      (item) => !(isObj(item) && SUBAGENT_NOTE.test(str(item['text']) ?? '')),
    )
    .map((item) => {
      if (isObj(item) && item['type'] === 'text')
        return str(item['text']) ?? '';
      if (isObj(item) && item['type'] === 'image') return '[image]';
      return JSON.stringify(item);
    })
    .join('\n');
};

const toolResultParts = (payload: Obj): ReadonlyArray<Part> =>
  blocks(payload['message']).flatMap((block): ReadonlyArray<Part> => {
    if (block['type'] !== 'tool_result') return [];
    const output = outputText(block['content']);
    const truncated = output.length > TOOL_OUTPUT_MAX;
    return [
      {
        type: 'toolResult',
        toolCallId: str(block['tool_use_id']) ?? '',
        output: truncated ? output.slice(0, TOOL_OUTPUT_MAX) : output,
        truncated,
        isError: block['is_error'] === true,
      },
    ];
  });

const CANCELLED_REASONS = new Set(['aborted_streaming', 'aborted_tools']);

const usageOf = (payload: Obj): Usage | undefined => {
  const usage = payload['usage'];
  if (!isObj(usage)) return undefined;
  const cacheRead = num(usage['cache_read_input_tokens']);
  const cacheWrite = num(usage['cache_creation_input_tokens']);
  const cost = num(payload['total_cost_usd']);
  return {
    inputTokens: num(usage['input_tokens']) ?? 0,
    outputTokens: num(usage['output_tokens']) ?? 0,
    ...(cacheRead === undefined ? {} : { cacheReadTokens: cacheRead }),
    ...(cacheWrite === undefined ? {} : { cacheWriteTokens: cacheWrite }),
    ...(cost === undefined ? {} : { costUsd: cost }),
  };
};

/** How a `result` record ends its turn, and why, when it failed. */
export const resultEnd = (
  payload: Readonly<Record<string, unknown>>,
): { readonly status: TurnEndStatus; readonly error?: string } => {
  const reason = str(payload['terminal_reason']);
  const failed =
    payload['subtype'] !== 'success' || payload['is_error'] === true;
  const status: TurnEndStatus =
    reason !== undefined && CANCELLED_REASONS.has(reason)
      ? 'cancelled'
      : failed
        ? 'failed'
        : 'done';
  const errors = Array.isArray(payload['errors'])
    ? payload['errors'].filter((e): e is string => typeof e === 'string')
    : [];
  const error =
    status !== 'failed'
      ? undefined
      : errors.length > 0
        ? errors.join('\n')
        : (str(payload['result']) ?? str(payload['subtype']));
  return error === undefined ? { status } : { status, error };
};

const turnEnded = (payload: Obj): Part => {
  const usage = usageOf(payload);
  return {
    type: 'turnEnded',
    ...resultEnd(payload),
    ...(usage === undefined ? {} : { usage }),
  };
};

const systemParts = (payload: Obj): ReadonlyArray<Part> => {
  if (payload['subtype'] !== 'compact_boundary') return [];
  const metadata = payload['compact_metadata'];
  const trigger = isObj(metadata) ? str(metadata['trigger']) : undefined;
  return [{ type: 'claude.compaction', trigger: trigger ?? 'auto' }];
};

/** A `text.chunk` record the session wrote from the token stream. */
const chunkParts = (payload: Obj): ReadonlyArray<Part> => {
  const streamId = str(payload['streamId']);
  const channel = payload['channel'];
  const text = str(payload['text']);
  if (
    streamId === undefined ||
    text === undefined ||
    (channel !== 'text' && channel !== 'reasoning')
  ) {
    return [];
  }
  return [{ type: 'textChunk', streamId, channel, text }];
};

const readAnswers = Schema.decodeUnknownOption(
  Schema.NullOr(QuestionAnswerSchema),
);

/** The user's answers to an Agent Question, as the harness recorded them. */
const answeredParts = (payload: Obj): ReadonlyArray<Part> => {
  const toolCallId = str(payload['toolUseId']);
  const answers = readAnswers(payload['answers']);
  return toolCallId === undefined || Option.isNone(answers)
    ? []
    : [{ type: 'questionAnswered', toolCallId, answers: answers.value }];
};

const roleAndParts = (
  kind: string,
  payload: Obj,
): Pick<Projected, 'role' | 'parts'> | null => {
  if (kind === 'text.chunk') {
    return { role: 'assistant', parts: chunkParts(payload) };
  }
  if (kind === QUESTION_ANSWERED) {
    return { role: 'tool', parts: answeredParts(payload) };
  }
  switch (payload['type']) {
    case 'assistant':
      return { role: 'assistant', parts: assistantParts(payload) };
    // A user message's own text is recorded by the engine as turnStarted;
    // only tool results are shown from it.
    case 'user':
      return { role: 'tool', parts: toolResultParts(payload) };
    case 'result':
      return { role: 'system', parts: [turnEnded(payload)] };
    case 'system':
      return { role: 'system', parts: systemParts(payload) };
    default:
      return null;
  }
};

/** One Raw record Claude Code wrote, to what a client shows, or null. */
export const project = (raw: Raw): Projected | null => {
  if (!isObj(raw.payload)) return null;
  const projected = roleAndParts(raw.kind, raw.payload);
  if (projected === null || projected.parts.length === 0) return null;
  return { agentId: raw.agentId, ...projected };
};
