import { Schema } from 'effect';
import { StdTable } from '@kestack/std-toolkit/db';
import { EntityESchema } from '@kestack/std-toolkit/eschema';

export const ThreadEntitySchema = EntityESchema.make('AgentThread', 'id', {
  folder: Schema.String,
  kind: Schema.String,
  createdAt: Schema.Finite,
  system: Schema.NullOr(Schema.String),
  mcp: Schema.Boolean,
  session: Schema.NullOr(Schema.String),
}).build();

export const MessageEntitySchema = EntityESchema.make('AgentMessage', 'id', {
  thread: Schema.String,
  message: Schema.String,
}).build();

export const table = StdTable.make('agent').primary('pk', 'sk').build();

export const threads = table.entity(ThreadEntitySchema).primary().build();

export const messages = table
  .entity(MessageEntitySchema)
  .primary({ pk: ['thread'] })
  .build();

export const tableName = 'agent_data';
