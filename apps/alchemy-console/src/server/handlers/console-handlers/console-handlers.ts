import { ConsoleApi } from '../../../shared/api/console-api/index.ts';
import * as operations from '../../workflows/store-operations/store-operations/index.ts';

export const ConsoleHandlers = ConsoleApi.toLayer({
  'AlchemyStateStore.Create': operations.create,
  'AlchemyStateStore.List': operations.list,
  'AlchemyStateStore.Rename': operations.rename,
  'AlchemyStateStore.UpdateCredentials': operations.updateCredentials,
  'AlchemyStateStore.Delete': operations.remove,
  'AlchemyStateStore.ListStacks': operations.listStacks,
  'AlchemyStateStore.ListStages': operations.listStages,
  'AlchemyStateStore.ListResources': operations.listResources,
  'AlchemyStateStore.GetStageView': operations.getStageView,
  'AlchemyStateStore.GetResourceState': operations.getResourceState,
  'AlchemyStateStore.PreviewStageDeletion': operations.preview,
  'AlchemyStateStore.DeleteStage': operations.destroy,
});
