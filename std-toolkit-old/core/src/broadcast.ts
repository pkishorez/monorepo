import { Context } from 'effect';
import { BroadcastSchemaType } from './schema.js';

export type BroadcastTo =
  | { to: 'all' }
  | { to: 'self'; connectionIds: string[] }
  | { to: 'others'; connectionIds: string[] };
export type BroadcastToPayload<T = any> = {
  value: BroadcastSchemaType<T>;
} & BroadcastTo;
export class BroadcastService extends Context.Tag('std-toolkit/broadcast')<
  BroadcastService,
  { broadcast: (value: BroadcastToPayload) => void }
>() {}
