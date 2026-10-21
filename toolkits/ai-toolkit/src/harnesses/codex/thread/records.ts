import type { Schema } from 'effect';
import type { RawOut } from '../../../harness/index.js';
import type { Notification, ThreadItem } from '../app-server/index.js';

/** Items that are something the agent does; their start is worth showing. */
const TOOL_ITEM_TYPES: ReadonlySet<string> = new Set([
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'dynamicToolCall',
  'collabAgentToolCall',
  'webSearch',
  'imageView',
  'imageGeneration',
] satisfies ReadonlyArray<ThreadItem['type']>);

export type ToolItem = Extract<
  ThreadItem,
  {
    type:
      | 'commandExecution'
      | 'fileChange'
      | 'mcpToolCall'
      | 'dynamicToolCall'
      | 'collabAgentToolCall'
      | 'webSearch'
      | 'imageView'
      | 'imageGeneration';
  }
>;

export const isToolItem = (item: ThreadItem): item is ToolItem =>
  TOOL_ITEM_TYPES.has(item.type);

/** Whole records kept as Raw. Every delta and status ping is left out. */
const KEPT = new Set([
  'item/completed',
  'turn/plan/updated',
  'thread/tokenUsage/updated',
  'turn/completed',
  'error',
]);

const isToolStart = (notification: Notification): boolean => {
  if (notification.method !== 'item/started') return false;
  const { item } = notification.params as { item: ThreadItem };
  return isToolItem(item);
};

/** The Raw record for one notification, or undefined when it is not kept. */
export const toRawOut = (
  notification: Notification,
  agentId: string | undefined,
): RawOut | undefined => {
  if (!KEPT.has(notification.method) && !isToolStart(notification))
    return undefined;
  const payload = notification.params as Schema.Json;
  return agentId === undefined
    ? { kind: notification.method, payload }
    : { kind: notification.method, payload, agentId };
};
