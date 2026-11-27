import { isAbsolute, relative } from 'node:path';
import { Schema } from 'effect';
import type { ClaudeOptions, Out } from '@kestack/ai-toolkit-v2/claude';
import type { JsonSchema, Message } from '../contract/index.js';

const READ_ONLY = ['Read', 'Grep', 'Glob'];

const isJson = Schema.is(Schema.Json);

export const optionsOf = (
  system: string | undefined,
  schema: JsonSchema | undefined,
): ClaudeOptions => ({
  tools: READ_ONLY,
  permissionMode: 'dontAsk',
  strictMcpConfig: true,
  mcpServers: {},
  ...(system === undefined
    ? {}
    : {
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: system,
        },
      }),
  ...(schema === undefined
    ? {}
    : { outputFormat: { type: 'json_schema', schema } }),
});

const field = (input: unknown, key: string): string | undefined => {
  if (typeof input !== 'object' || input === null || !(key in input))
    return undefined;
  const value: unknown = Reflect.get(input, key);
  return typeof value === 'string' ? value : undefined;
};

const shown = (folder: string, path: string) =>
  isAbsolute(path) ? relative(folder, path) || '.' : path;

const activityOf = (
  folder: string,
  tool: string,
  input: unknown,
): string | undefined => {
  const file = field(input, 'file_path');
  const pattern = field(input, 'pattern');
  const path = field(input, 'path');
  const within = path === undefined ? '' : ` in ${shown(folder, path)}`;
  switch (tool) {
    case 'Read':
      return `Reading ${file === undefined ? 'a file' : shown(folder, file)}`;
    case 'Grep':
      return `Searching for ${pattern ?? 'text'}${within}`;
    case 'Glob':
      return `Finding ${pattern ?? 'files'}${within}`;
    case 'StructuredOutput':
      return undefined;
    default:
      return `Using ${tool}`;
  }
};

export const failed = (reason: string, at: number): Message => ({
  _tag: 'Status',
  status: 'failed',
  reason,
  at,
});

const endedOf = (
  ended: Extract<Out, { _tag: 'Ended' }>,
  at: number,
): ReadonlyArray<Message> => {
  if (ended.status === 'cancelled')
    return [{ _tag: 'Status', status: 'cancelled', at }];
  const result = ended.result;
  if (ended.status === 'failed' || result?.subtype !== 'success')
    return [
      failed(ended.error ?? 'Claude Code stopped without an answer.', at),
    ];
  const data: unknown = result.structured_output;
  return [
    isJson(data)
      ? { _tag: 'Assistant', data, at }
      : { _tag: 'Assistant', text: result.result, at },
    { _tag: 'Status', status: 'done', at },
  ];
};

export const messagesOf = (
  folder: string,
  out: Out,
  at: number,
): ReadonlyArray<Message> => {
  if (out._tag === 'Ended') return endedOf(out, at);
  if (out._tag !== 'Record' || out.record.type !== 'assistant') return [];
  return out.record.message.content.flatMap((block) => {
    if (block.type !== 'tool_use') return [];
    const text = activityOf(folder, block.name, block.input);
    return text === undefined ? [] : [{ _tag: 'Activity', text, at }];
  });
};
