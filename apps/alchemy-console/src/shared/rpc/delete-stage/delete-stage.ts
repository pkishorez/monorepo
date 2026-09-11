import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  deletionOptions,
  stageTarget,
  deletionEvent,
  DeleteStageError,
} from '../../contracts/delete-stage/index.ts';

export const DeleteStage = RpcGroup.make(
  Rpc.make('AlchemyStateStore.DeleteStage', {
    payload: {
      ...stageTarget.fields,
      ...deletionOptions.fields,
      fingerprint: Schema.String,
      acknowledgement: Schema.optional(Schema.String),
    },
    success: deletionEvent,
    error: DeleteStageError,
    stream: true,
  }),
);
