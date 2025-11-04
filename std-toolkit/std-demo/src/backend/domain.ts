import { Rpc, RpcGroup } from '@effect/rpc';
import { Schema } from 'effect';
import { ESchema } from '@std-toolkit/eschema';

export class TodoError extends Schema.TaggedError<TodoError>('TodoError')(
  'TodoError',
  {
    type: Schema.optional(Schema.String),
  },
) {}

export const TodoESchema = ESchema.make(
  'v1',
  Schema.Struct({
    userId: Schema.String,
    todoId: Schema.String,
    updatedAt: Schema.String,
    title: Schema.String,
  }),
).build();

export class TodosRpc extends RpcGroup.make(
  // Rpc.make('todoStream', {
  //   payload: {
  //     gt: Schema.optional(Schema.String),
  //   },
  //   success: Schema.Array(TodoESchema.schema),
  //   error: TodoError,
  //   stream: true,
  // }),
  Rpc.make('todoQuery', {
    payload: {
      updatedAt: Schema.optional(Schema.String),
    },
    success: Schema.Array(TodoESchema.schema),
    error: TodoError,
  }),
  Rpc.make('todoInsert', {
    payload: {
      todo: TodoESchema.schema,
    },
    success: TodoESchema.schema,
    error: TodoError,
  }),
  Rpc.make('todoUpdate', {
    payload: {
      todoId: Schema.String,
      todo: Schema.partial(TodoESchema.schema),
    },
    success: Schema.partial(TodoESchema.schema),
    error: TodoError,
  }),
) {}
