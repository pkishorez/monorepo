import { randomBytes, randomUUID } from 'node:crypto';

/** A new Connection id. */
export const newConnectionId = (): string => randomUUID();

/** A new Connection Key: 32 random bytes, URL-safe, so it fits a WebSocket subprotocol. */
export const newConnectionKey = (): string =>
  randomBytes(32).toString('base64url');
