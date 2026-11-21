import type { TurnEnd } from '../../contract/index.js';
import { isNotification, type Notification } from '../app-server/index.js';
import { readableError, TURN_END } from '../record-kinds/index.js';

export { readableError, TURN_END } from '../record-kinds/index.js';

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
