import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  deletionOptions,
  stageTarget,
  previewEvent,
  DeleteStageError,
} from '../../contracts/delete-stage/index.ts';
export const StageDeletionPreview = RpcGroup.make(
  Rpc.make('AlchemyStateStore.PreviewStageDeletion', {
    payload: Schema.Struct({
      ...stageTarget.fields,
      ...deletionOptions.fields,
    }),
    success: previewEvent,
    error: DeleteStageError,
    stream: true,
  }),
);
