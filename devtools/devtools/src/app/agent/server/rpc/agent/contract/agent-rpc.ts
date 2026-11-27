import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';

export const AGENT_RPC_PATH = '/rpc/agent';

const RunStatusSchema = Schema.Literals([
  'running',
  'done',
  'failed',
  'cancelled',
]);
export type RunStatus = typeof RunStatusSchema.Type;

const MessageSchema = Schema.TaggedUnion({
  User: { text: Schema.String, at: Schema.Number },
  Assistant: {
    text: Schema.optionalKey(Schema.String),
    data: Schema.optionalKey(Schema.Json),
    at: Schema.Number,
  },
  Activity: { text: Schema.String, at: Schema.Number },
  Status: {
    status: RunStatusSchema,
    reason: Schema.optionalKey(Schema.String),
    at: Schema.Number,
  },
});
export type Message = typeof MessageSchema.Type;

const ThreadSchema = Schema.Struct({
  id: Schema.String,
  folder: Schema.String,
  title: Schema.String,
  createdAt: Schema.Number,
  status: RunStatusSchema,
});
export type Thread = typeof ThreadSchema.Type;

const JsonSchemaSchema = Schema.JsonObject;
export type JsonSchema = typeof JsonSchemaSchema.Type;

export class AgentError extends Schema.TaggedError<AgentError>('AgentError')(
  'AgentError',
  {
    reason: Schema.Literals(['unknown-thread', 'busy']),
    message: Schema.String,
  },
) {}

export const AgentRpc = RpcGroup.make(
  Rpc.make('ask', {
    payload: {
      folder: Schema.String,
      prompt: Schema.String,
      system: Schema.optionalKey(Schema.String),
      schema: Schema.optionalKey(JsonSchemaSchema),
    },
    success: Schema.String,
  }),
  Rpc.make('followUp', {
    payload: {
      thread: Schema.String,
      prompt: Schema.String,
      schema: Schema.optionalKey(JsonSchemaSchema),
    },
    error: AgentError,
  }),
  Rpc.make('threads', {
    payload: { folder: Schema.String },
    success: Schema.Array(ThreadSchema),
  }),
  Rpc.make('watch', {
    payload: { thread: Schema.String },
    success: Schema.Array(MessageSchema),
    error: AgentError,
    stream: true,
  }),
  Rpc.make('cancel', {
    payload: { thread: Schema.String },
    error: AgentError,
  }),
);
