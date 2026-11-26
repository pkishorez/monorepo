import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz, type Guarded } from '@kestack/auth-toolkit';
import { ESchema } from '@kestack/std-toolkit/eschema';
import {
  Answer,
  ConnectionRemoved,
  ConnectionTaken,
  Report,
} from './report.js';

const RemovePayload = ESchema.make('RemovePayload', {
  id: Schema.NonEmptyString,
}).build();

const Rpcs = RpcGroup.make(
  Rpc.make('Report', {
    payload: Report.schema,
    success: Answer.schema,
    error: Schema.Union([ConnectionRemoved, ConnectionTaken]),
  }),
  Rpc.make('Remove', {
    payload: RemovePayload.schema,
    success: Schema.Void,
  }),
);

export const HeartbeatApi: Guarded<typeof Rpcs> = Authz.required(Rpcs);
