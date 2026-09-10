import { Schema } from 'effect';
import { Authz } from 'auth-toolkit/rpc';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  stageTarget,
  deletionEvent,
  previewEvent,
  DeleteStageError,
} from '../../contracts/delete-stage/index.ts';

export const DeleteStage = RpcGroup.make(
  Rpc.make('AlchemyStateStore.PreviewStageDeletion', {
    payload: stageTarget,
    success: previewEvent,
    error: DeleteStageError,
    stream: true,
  }).pipe(Authz.guard()),
  Rpc.make('AlchemyStateStore.DeleteStage', {
    payload: { ...stageTarget.fields, fingerprint: Schema.String },
    success: deletionEvent,
    error: DeleteStageError,
    stream: true,
  }).pipe(Authz.guard()),
);
