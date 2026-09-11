import { ConsoleApi } from '../../../shared/api/console-api/index.ts';
import * as credentials from '../../workflows/credentials/index.ts';
import * as stores from '../../workflows/stores/stores/index.ts';

export const ConsoleHandlers = ConsoleApi.toLayer({
  'Credentials.Create': credentials.create,
  'Credentials.List': credentials.list,
  'Credentials.Update': credentials.update,
  'Credentials.Delete': credentials.remove,
  'Stores.Create': stores.create,
  'Stores.List': stores.list,
  'Stores.Update': stores.update,
  'Stores.Delete': stores.remove,
  'Stores.DeleteStack': stores.deleteStack,
  'Explorer.ListStacks': stores.listStacks,
  'Explorer.ListStages': stores.listStages,
  'Explorer.ListResources': stores.listResources,
  'Explorer.GetStageView': stores.getStageView,
  'Explorer.GetResourceState': stores.getResourceState,
  'Deletion.Preview': stores.preview,
  'Deletion.Delete': stores.destroy,
});
