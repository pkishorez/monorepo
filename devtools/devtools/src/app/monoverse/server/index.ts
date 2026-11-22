import { Layer } from 'effect';
import { RpcSerialization, RpcServer } from 'effect/rpc';

import { MonoverseRpc } from '../contract/index.js';
import { foldersRpcLayer } from './folders/index.js';
import { ExploreRpcLive } from './handlers.js';
import {
  ProjectRegistryRpcLive,
  sqliteProjectRegistryLayer,
} from './projects/index.js';

/*
 * Monoverse's server door: its RPC at /rpc/monoverse, with the Project
 * registry kept in the DevTools database at `db` (its own table; other
 * Tools may share the file), and the folder picker walking from `home`
 * (the user's home folder unless given).
 */

const path = '/rpc/monoverse';

export const monoverseServer = (options: {
  readonly db: string;
  readonly home?: string | undefined;
}) =>
  RpcServer.layerHttp({ group: MonoverseRpc, path, protocol: 'http' }).pipe(
    Layer.provide(
      Layer.mergeAll(
        ProjectRegistryRpcLive.pipe(
          Layer.provide(sqliteProjectRegistryLayer({ path: options.db })),
        ),
        foldersRpcLayer(options.home),
        ExploreRpcLive,
      ),
    ),
    Layer.provide(RpcSerialization.layerNdjson),
  );

export const monoverseEndpoints: Readonly<Record<string, string>> = {
  [path]:
    'Monoverse RPC: the Project registry, folders under home, and a Project at a branch: its Workspace, a Package with its file import graph, files, branches, and changes',
};
