import { isNotification, type Notification } from '../app-server/index.js';

/**
 * The Fork Point a notification makes: the id of a main-thread turn that
 * just finished, however it ended. Sub-agent turns are not Fork Points.
 */
export const finishedTurnId = (
  notification: Notification,
  mainThreadId: string,
): string | undefined =>
  isNotification(notification, 'turn/completed') &&
  notification.params.threadId === mainThreadId
    ? notification.params.turn.id
    : undefined;
