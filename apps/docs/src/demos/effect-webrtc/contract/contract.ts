import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

const SendMessage = Rpc.make('SendMessage', {
  payload: {
    id: Schema.String,
    author: Schema.String,
    text: Schema.String,
  },
  success: Schema.Struct({ id: Schema.String }),
});

export const Messages = RpcGroup.make(SendMessage);
