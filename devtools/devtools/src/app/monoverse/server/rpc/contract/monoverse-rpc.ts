import { GitRpc } from '../git/contract/index.js';
import { ProjectRpc } from '../project/contract/index.js';
import { ProjectsRpc } from '../projects/contract/index.js';

export const MONOVERSE_RPC_PATH = '/rpc/monoverse';

export const MonoverseRpc = ProjectsRpc.merge(ProjectRpc, GitRpc);
