import type { Schema } from 'effect';
import type { RawOut } from '../../contract/index.js';
import type { Notification, ThreadItem } from '../app-server/index.js';
import { isToolItem } from '../record-kinds/index.js';

export { isToolItem, type ToolItem } from '../record-kinds/index.js';

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
