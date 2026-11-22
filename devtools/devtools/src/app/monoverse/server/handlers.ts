import { Effect } from 'effect';

import { ExploreRpc, WorkspaceReadError } from '../contract/index.js';
import { isWithin, rootRelative } from '../model/index.js';
import { getBranches, getChanges, getFileDiff } from './changes/index.js';
import { readSourceRoots } from './config/index.js';
import { buildFileGraph } from './file-graph/index.js';
import { readRootFile } from './files/index.js';
import { openSnapshot, type Snapshot } from './snapshot/index.js';
import { analyzeMonorepo } from './workspace/index.js';

/*
 * Where the work happens: the server does what needs the disk, git and
 * OXC, and hands back raw facts, the files and the file import graph, of
 * the Project at the branch asked for. Everything that depends on what is
 * open or selected (the tree, the roll-up of connections, the rule) runs
 * in the browser on those facts, from `model/`, so a click never waits on
 * the server.
 */

/** The workspace and the files outside its Packages, for the repo view. */
export function openProject(root: string, branch: string | null) {
  return Effect.gen(function* () {
    const snapshot = yield* openSnapshot(root, branch);
    const known = yield* listFiles(snapshot, '');
    const workspace = yield* analyzeMonorepo(snapshot, known);
    const packages = workspace.packages.map(({ path }) => rootRelative(path));
    const files = known.filter(
      (path) => !packages.some((pkg) => isWithin(path, pkg)),
    );
    return { ...workspace, files };
  });
}

/** One Package's files, Source roots and file import graph, for its view. */
export function readPackage(root: string, branch: string | null, path: string) {
  return Effect.gen(function* () {
    const snapshot = yield* openSnapshot(root, branch);
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

/** Fulfils every RPC but the Project registry's and the folders'. */
export const ExploreRpcLive = ExploreRpc.toLayer({
  OpenProject: ({ root, branch }) => openProject(root, branch),
  ReadPackage: ({ root, branch, path }) => readPackage(root, branch, path),
  ReadFile: ({ root, branch, path }) => readRootFile(root, branch, path),
  GetBranches: ({ root }) => getBranches(root),
  GetChanges: ({ root, branch, base }) => getChanges(root, branch, base),
  GetFileDiff: ({ root, branch, base, path }) =>
    getFileDiff(root, branch, base, path),
});
