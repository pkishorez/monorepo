import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { EntitySchema } from 'std-toolkit/core';
import { common } from '../../runtime/protocol/index.js';
import { MessageSchema, ThreadSchema } from '../../runtime/table/index.js';
import { AiRpc } from '../../rpc/contract/index.js';

export class PlaygroundFailed extends Schema.TaggedError<PlaygroundFailed>()(
  'PlaygroundFailed',
  { message: Schema.String },
) {}

const ThreadEntity = EntitySchema(ThreadSchema);
const MessageEntity = EntitySchema(MessageSchema);

export class AiPlaygroundRpc extends RpcGroup.make(
  Rpc.make('createThread', {
    payload: Schema.Struct({
      id: Schema.String,
      harness: Schema.Literals(common.harnessIds),
    }),
    success: ThreadEntity,
    error: PlaygroundFailed,
  }),
  Rpc.make('subscribeThreads', {
    payload: Schema.Struct({ '>': Schema.NullOr(ThreadEntity) }),
    success: Schema.Array(ThreadEntity),
    error: PlaygroundFailed,
    stream: true,
  }),
  Rpc.make('subscribeMessages', {
    payload: Schema.Struct({
      threadId: Schema.String,
      '>': Schema.NullOr(MessageEntity),
    }),
    success: Schema.Array(MessageEntity),
    error: PlaygroundFailed,
    stream: true,
  }),
) {}

export const AiPlaygroundServerRpc = AiRpc.merge(AiPlaygroundRpc);
