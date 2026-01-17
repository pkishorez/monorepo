import { Rpc, RpcGroup } from '@effect/rpc';
import { Schema } from 'effect';
import { makeESchema } from '@std-toolkit/eschema';
import {
  toEffectBroadcastSchema,
  toEffectSchema,
} from '@std-toolkit/eschema/effect.js';
import * as v from 'valibot';
import { StdESchema } from '@std-toolkit/eschema/eschema-std.js';

export class TodoError extends Schema.TaggedError<TodoError>('TodoError')(
  'TodoError',
  {
    type: Schema.optional(Schema.standardSchemaV1(Schema.String)),
    info: Schema.optional(Schema.Any),
  },
) {}

export const TodoESchema = StdESchema.make(
  'todos',
  makeESchema({
    userId: v.string(),
    todoId: v.string(),
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
    .build(),
)
  .key({
    deps: ['todoId'],
    encode: ({ todoId }) => todoId,
  })
  .build();

export class TodosRpc extends RpcGroup.make(
  Rpc.make('todoQuery', {
    payload: {
      updatedAt: Schema.optional(Schema.String),
    },
    success: Schema.Array(
      toEffectBroadcastSchema(toEffectSchema(TodoESchema.schema)),
    ),
    error: TodoError,
  }),
  Rpc.make('subscribeQuery', {
    payload: {
      updatedAt: Schema.optional(Schema.String),
    },
    success: Schema.Struct({ success: Schema.Literal(true) }),
    error: TodoError,
  }),
  Rpc.make('unsubscribeQuery', {
    success: Schema.Struct({ success: Schema.Literal(true) }),
  }),
  Rpc.make('todoInsert', {
    payload: {
      todo: toEffectSchema(TodoESchema.schema),
    },
    success: toEffectBroadcastSchema(toEffectSchema(TodoESchema.schema)),
    error: TodoError,
  }),
  Rpc.make('todoUpdate', {
    payload: {
      todoId: Schema.String,
      todo: Schema.partial(toEffectSchema(TodoESchema.schema)),
    },
    success: toEffectBroadcastSchema(
      Schema.partial(toEffectSchema(TodoESchema.schema)),
    ),
    error: TodoError,
  }),
) {}
