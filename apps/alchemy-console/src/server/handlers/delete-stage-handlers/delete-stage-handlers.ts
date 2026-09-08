import { DeleteStage } from '../../../shared/rpc/delete-stage/index.ts';
import * as operations from '../../workflows/delete-stage/index.ts';

export const DeleteStageHandlers = DeleteStage.toLayer({
  'AlchemyStateStore.PreviewStageDeletion': operations.preview,
  'AlchemyStateStore.DeleteStage': operations.destroy,
});
