import type * as cf from '@cloudflare/workers-types';
import { Effect } from 'effect';

/*
 * A hibernated socket as the websocket server holds it: the same shape the
 * server's own `fromDurableObjectState` wraps each socket in, so a socket
 * handed to a callback is the one it accepted.
 */

/** A code a close frame may carry: a peer that closed with none (1005) or dropped (1006) is answered with a plain 1000. */
export const sendable = (code: number) =>
  code === 1000 ||
  (code >= 1001 && code <= 1014 && ![1004, 1005, 1006].includes(code)) ||
  (code >= 3000 && code <= 4999)
    ? code
    : 1000;

export const socketOf = (ws: cf.WebSocket) => ({
  ws,
  close: (code: number, reason: string) =>
    Effect.sync(() => ws.close(sendable(code), reason)),
  serializeAttachment: <T>(value: T) => ws.serializeAttachment(value),
  deserializeAttachment: <T>() => ws.deserializeAttachment() as T | null,
});
