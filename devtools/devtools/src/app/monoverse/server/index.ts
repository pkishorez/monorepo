import { Layer } from 'effect';
import { RpcSerialization, RpcServer } from 'effect/rpc';

import { MONOVERSE_RPC_PATH, MonoverseRpc } from './rpc/contract/index.js';
import { FilesRpcLive } from './rpc/files/real/index.js';
import { foldersRpcLayer } from './rpc/folders/real/index.js';
import { GitRpcLive } from './rpc/git/real/index.js';
import { ProjectRegistryRpcLive } from './rpc/project-registry/real/index.js';
import { ProjectRpcLive } from './rpc/project/real/index.js';
import { gitLayer } from './services/git/real/index.js';
import { sqliteProjectStoreLayer } from './services/project-store/real/index.js';
import { snapshotsLayer } from './services/snapshots/real/index.js';

/*
 * Monoverse's server door: its RPC at /rpc/monoverse, with the Project
 * store kept in the DevTools database at `db` (its own table; other
 * Tools may share the file), and the folder picker walking from `home`
 * (the user's home folder unless given).
 */

export const monoverseServer = (options: {
  readonly db: string;
  readonly home?: string | undefined;
}) =>
  RpcServer.layerHttp({
    group: MonoverseRpc,
    path: MONOVERSE_RPC_PATH,
    protocol: 'http',
  }).pipe(
    Layer.provide(
      Layer.mergeAll(
        ProjectRegistryRpcLive,
        foldersRpcLayer(options.home),
        ProjectRpcLive,
        FilesRpcLive,
        GitRpcLive,
      ),
    ),
    Layer.provide(
      Layer.mergeAll(
        sqliteProjectStoreLayer({ path: options.db }),
        snapshotsLayer.pipe(Layer.provideMerge(gitLayer)),
      ),
    ),
    Layer.provide(RpcSerialization.layerNdjson),
  );

export const monoverseEndpoints: Readonly<Record<string, string>> = {
  [MONOVERSE_RPC_PATH]:
    'Monoverse RPC: the Project registry, folders under home, and a Project at a branch: its Workspace, a Package with its file import graph, files, branches, and changes',
};
