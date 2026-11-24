import { Effect } from 'effect';

import { rootRelative } from '../../contract/index.js';
import {
  Snapshots,
  type Snapshot,
} from '../../../services/snapshots/contract/index.js';
import { ProjectRpc, WorkspaceReadError } from '../contract/index.js';
import { readSourceRoots } from './config/config.js';
import { buildFileGraph } from './file-graph/file-graph.js';
import { analyzeMonorepo } from './workspace/analyze-monorepo.js';

/*
 * Where the work happens: the server does what needs the disk, git and
 * OXC, and hands back raw facts, the files and the file import graph, of
 * the Project at the branch asked for. Everything that depends on what is
 * open or selected (the tree, the roll-up of connections, the rule) runs
 * in the browser on those facts, in the Actors' logic and the Monorepo
 * service, so a click never waits on the server.
 */

/**
 * The workspace and every file in it, for the repo view: its tree draws
 * each Package as one node, and a folder viewed lists the files inside
 * its Packages too.
 */
export function openProject(root: string, branch: string | null) {
  return Effect.gen(function* () {
    const snapshots = yield* Snapshots;
    const snapshot = yield* snapshots.open(root, branch);
    const files = yield* listFiles(snapshot, '');
    const workspace = yield* analyzeMonorepo(snapshot, files);
    return { ...workspace, files };
  });
}

/** One Package's files, Source roots and file import graph, for its view. */
export function readPackage(root: string, branch: string | null, path: string) {
  return Effect.gen(function* () {
    const snapshots = yield* Snapshots;
    const snapshot = yield* snapshots.open(root, branch);
    const base = rootRelative(path);
    const files = yield* listFiles(snapshot, base);
    const manifest = base === '' ? 'package.json' : `${base}/package.json`;
    if (!files.includes(manifest)) {
      return yield* new WorkspaceReadError({
        reason: 'package-not-found',
        path,
        message: 'No package.json in this folder.',
      });
    }
    const sourceRoots = yield* readSourceRoots(snapshot, path);
    const imports = yield* buildFileGraph(snapshot, files, sourceRoots).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceReadError({
            reason: 'imports',
            path,
            message: `Could not read the imports: ${String(error.cause)}`,
          }),
      ),
    );
    return { path: base, files, sourceRoots, imports };
  });
}

function listFiles(snapshot: Snapshot, folder: string) {
  return Effect.tryPromise({
    try: () => snapshot.list(folder),
    catch: (cause) =>
      new WorkspaceReadError({
        reason: 'files',
        path: snapshot.root,
        message: `Could not list the files: ${String(cause)}`,
      }),
  });
}

/** Fulfils the Project RPC, reading through Snapshots. */
export const ProjectRpcLive = ProjectRpc.toLayer({
  OpenProject: ({ root, branch }) => openProject(root, branch),
  ReadPackage: ({ root, branch, path }) => readPackage(root, branch, path),
});
