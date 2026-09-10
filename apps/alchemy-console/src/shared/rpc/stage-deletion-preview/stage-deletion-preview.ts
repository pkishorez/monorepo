import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  stageTarget,
  previewEvent,
  DeleteStageError,
} from '../../contracts/delete-stage/index.ts';
export const StageDeletionPreview = RpcGroup.make(
  Rpc.make('AlchemyStateStore.PreviewStageDeletion', {
    payload: stageTarget,
    success: previewEvent,
    error: DeleteStageError,
    stream: true,
  }),
);
