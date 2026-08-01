import { EntityESchema } from 'std-toolkit/eschema';
import { ThreadV1 } from './versions/v1.js';

export const ThreadSchema = EntityESchema.make(
  'Thread',
  'threadId',
  ThreadV1,
).build();

export type Thread = typeof ThreadSchema.Type;
