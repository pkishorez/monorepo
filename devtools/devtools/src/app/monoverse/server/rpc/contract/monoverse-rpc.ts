import { FilesRpc } from '../files/contract/index.js';
import { FoldersRpc } from '../folders/contract/index.js';
import { GitRpc } from '../git/contract/index.js';
import { ProjectRegistryRpc } from '../project-registry/contract/index.js';
import { ProjectRpc } from '../project/contract/index.js';

/** Where Monoverse's server answers. */
export const MONOVERSE_RPC_PATH = '/rpc/monoverse';

/** Everything Monoverse asks its server, at `/rpc/monoverse`. */
export const MonoverseRpc = ProjectRegistryRpc.merge(
  FoldersRpc,
  ProjectRpc,
  FilesRpc,
  GitRpc,
);
