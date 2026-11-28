import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { ESchema } from '@kestack/std-toolkit/eschema';

export const RunningConnection = ESchema.make('RunningConnection', {
  name: Schema.String,
  id: Schema.String,
  url: Schema.NullOr(Schema.String),
}).build();

export const ConnectionControl = RpcGroup.make(
  Rpc.make('status', { success: RunningConnection.schema }),
  Rpc.make('stop'),
);

export type RunningConnection = typeof RunningConnection.Type;
