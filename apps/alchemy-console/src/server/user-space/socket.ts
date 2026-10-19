import type * as cf from '@cloudflare/workers-types';
import { Effect } from 'effect';

/*
 * A hibernated socket as the websocket server holds it: the same shape the
 * server's own `fromDurableObjectState` wraps each socket in, so a socket
 * handed to a callback is the one it accepted.
 */

export const socketOf = (ws: cf.WebSocket) => ({
  ws,
  close: (code: number, reason: string) =>
    Effect.sync(() => ws.close(code, reason)),
  serializeAttachment: <T>(value: T) => ws.serializeAttachment(value),
  deserializeAttachment: <T>() => ws.deserializeAttachment() as T | null,
});
