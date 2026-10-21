import { Schema } from 'effect';
import type { RawOut } from '../../../harness/index.js';

/** One message the query yields, read as plain JSON. */
export type SdkRecord = Readonly<Record<string, unknown>>;

/**
 * Records we do not keep: token deltas (kept as `text.chunk` records
 * instead, which a whole record's streamed blocks point at), the CLI's
 * queue bookkeeping, and thinking-token counters.
 * Everything else is a whole record.
 */
export const skipped = (message: SdkRecord): boolean =>
  message['type'] === 'stream_event' ||
  message['type'] === 'command_lifecycle' ||
  (message['type'] === 'system' && message['subtype'] === 'thinking_tokens');

const kindOf = (message: SdkRecord): string =>
  message['type'] === 'system' && typeof message['subtype'] === 'string'
    ? `system/${message['subtype']}`
    : String(message['type']);

const toJson = (message: unknown): Schema.Json =>
  JSON.parse(JSON.stringify(message)) as Schema.Json;

export const toRawOut = (message: SdkRecord): RawOut => {
  const parent = message['parent_tool_use_id'];
  return {
    kind: kindOf(message),
    payload: toJson(message),
    ...(typeof parent === 'string' ? { agentId: parent } : {}),
  };
};

const isSystem = (message: SdkRecord, subtype: string): boolean =>
  message['type'] === 'system' && message['subtype'] === subtype;

/**
 * The transcript entry a Fork Point may name: the main agent's assistant
 * and user messages, by uuid. A turn's last one is where a fork keeps it
 * whole, tool results of an interrupted turn included. Subagent messages
 * live in their own transcripts.
 */
export const forkPointOf = (message: SdkRecord): string | undefined =>
  (message['type'] === 'assistant' || message['type'] === 'user') &&
  typeof message['parent_tool_use_id'] !== 'string' &&
  typeof message['uuid'] === 'string'
    ? message['uuid']
    : undefined;

/** Claude Code opens every turn with `system/init`, its own turns included. */
export const opensTurn = (message: SdkRecord): boolean =>
  isSystem(message, 'init');

/**
 * What is kept from between turns: a background subagent's records, and
 * the notice that a background task ended, which Claude Code then starts a
 * turn to tell the model about.
 */
export const keptWhileIdle = (message: SdkRecord): boolean =>
  typeof message['parent_tool_use_id'] === 'string' ||
  isSystem(message, 'task_notification');
