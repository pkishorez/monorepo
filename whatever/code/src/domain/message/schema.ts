import { EntityESchema } from 'std-toolkit/eschema';
import { MessageV1 } from './versions/v1.js';

export const MessageSchema = EntityESchema.make(
  'Message',
  'messageId',
  MessageV1,
).build();

export type Message = typeof MessageSchema.Type;
