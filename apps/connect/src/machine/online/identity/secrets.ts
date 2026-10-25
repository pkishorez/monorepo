import { randomBytes, randomUUID } from 'node:crypto';

/** A new Machine id. */
export const newMachineId = (): string => randomUUID();

/** A new Machine Key: 32 random bytes, URL-safe, so it fits a WebSocket subprotocol. */
export const newMachineKey = (): string =>
  randomBytes(32).toString('base64url');
