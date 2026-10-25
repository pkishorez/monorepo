import type { TurnEnd } from '../../contract/index.js';
import type { TurnEndStatus } from '../../../contract/projection/index.js';
import {
  isNotification,
  type Notification,
  type TurnStatus,
} from '../app-server/index.js';

export const TURN_END: Record<TurnStatus, TurnEndStatus> = {
  completed: 'done',
  interrupted: 'cancelled',
  failed: 'failed',
  inProgress: 'failed',
};

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

/**
 * How a main-thread turn ended, from its `turn/completed`, with the turn's
 * id as its Fork Point. Sub-agent turns end nothing of ours.
 */
export const turnEndOf = (
  notification: Notification,
  mainThreadId: string,
): TurnEnd | undefined => {
  if (
    !isNotification(notification, 'turn/completed') ||
    notification.params.threadId !== mainThreadId
  )
    return undefined;
  const { turn } = notification.params;
  return {
    _tag: 'TurnEnd',
    status: TURN_END[turn.status],
    ...(turn.error === null
      ? {}
      : { error: readableError(turn.error.message) }),
    forkPoint: turn.id,
    shown: true,
  };
};
