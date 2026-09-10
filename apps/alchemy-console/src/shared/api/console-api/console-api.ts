import { Authz } from 'auth-toolkit/rpc';
import { StateStores } from '../../rpc/state-stores/index.ts';
import { StateBrowser } from '../../rpc/state-browser/index.ts';
import { ResourceBrowser } from '../../rpc/resource-browser/index.ts';
import { StageOutputs } from '../../rpc/stage-outputs/index.ts';
import { StageDeletionPreview } from '../../rpc/stage-deletion-preview/index.ts';
import { DeleteStage } from '../../rpc/delete-stage/index.ts';

export const ConsoleApi = Authz.guard()(
  StateStores.merge(
    StateBrowser,
    ResourceBrowser,
    StageOutputs,
    StageDeletionPreview,
    DeleteStage,
  ),
);
