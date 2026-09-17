import { Schema } from 'effect';
import { EntityESchema } from 'std-toolkit/eschema';
import { AiMessagePartSchema } from '../../protocol/index.js';

export const MESSAGE_ROLES = ['system', 'user', 'assistant'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** One immutable flush of a Run's Transcript. */
export const MessageSchema = EntityESchema.make('AiMessage', 'id', {
  threadId: Schema.String,
  runId: Schema.String,
  role: Schema.Literals(MESSAGE_ROLES),
  createdAt: Schema.Number,
  data: Schema.Struct({
    parts: Schema.Array(AiMessagePartSchema),
    metadata: Schema.NullOr(Schema.Unknown),
  }),
}).build();

export type Message = typeof MessageSchema.Type;
