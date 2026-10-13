import { LotelRpc } from '../lotel/rpc/index.js';
import { GitRpc } from './git/index.js';
import { LaymosRpc } from './laymos/index.js';
import { MonoverseRpc } from './monoverse/index.js';
import { ProjectRegistryRpc } from './project-registry/index.js';

export const DevtoolsRpc = LotelRpc.merge(LaymosRpc)
  .merge(GitRpc)
  .merge(MonoverseRpc)
  .merge(ProjectRegistryRpc);
