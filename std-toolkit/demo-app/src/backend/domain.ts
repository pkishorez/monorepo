import { Rpc, RpcGroup } from '@effect/rpc';
import { Schema } from 'effect';
import { ESchema } from '@std-toolkit/eschema';
import { toEffectSchema } from '@std-toolkit/eschema/effect.js';
import * as v from 'valibot';

export class TodoError extends Schema.TaggedError<TodoError>('TodoError')(
  'TodoError',
  {
    type: Schema.optional(Schema.standardSchemaV1(Schema.String)),
    info: Schema.optional(Schema.Any),
  },
) {}

export const TodoESchema = ESchema.make({
  userId: v.string(),
  todoId: v.string(),
  updatedAt: v.string(),
  title: v.string(),
})
  .evolve(
    'v2',
    ({ v1 }) => ({
      ...v1,
      status: v.picklist(['complete', 'active']),
    }),
    (value) => ({ ...value, status: 'active' as const }),
  )
  .name('todos')
  .build();

export class TodosRpc extends RpcGroup.make(
  // Rpc.make('todoStream', {
  //   payload: {
  //     gt: Schema.optional(Schema.standardSchemaV1(Schema.String)),
  //   },
  //   success: Schema.Array(TodoESchema.schema),
  //   error: TodoError,
  //   stream: true,
  // }),
  Rpc.make('todoQuery', {
    payload: {
      updatedAt: Schema.optional(Schema.String),
    },
    success: Schema.Array(toEffectSchema(TodoESchema.schema)),
    error: TodoError,
  }),
  Rpc.make('todoInsert', {
    payload: {
      todo: toEffectSchema(TodoESchema.schema),
    },
    success: toEffectSchema(TodoESchema.schema),
    error: TodoError,
  }),
  Rpc.make('todoUpdate', {
    payload: {
      todoId: Schema.String,
      todo: Schema.partial(toEffectSchema(TodoESchema.schema)),
    },
    success: Schema.partial(toEffectSchema(TodoESchema.schema)),
    error: TodoError,
  }),
) {}
