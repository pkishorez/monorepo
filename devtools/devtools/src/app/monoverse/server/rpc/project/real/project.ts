import { Effect } from 'effect';

import { isWithin, rootRelative } from '../../contract/index.js';
import {
  Snapshots,
  type Snapshot,
} from '../../../services/snapshots/contract/index.js';
import { ProjectRpc, WorkspaceReadError } from '../contract/index.js';
import { checkOf, readSettings, sourceRootsOf } from './check/check.js';
import { buildFileGraph } from './file-graph/file-graph.js';
import { analyzeMonorepo } from './workspace/analyze-monorepo.js';

/*
 * Where the work happens: the server does what needs the disk, git and
 * OXC, and hands back the files and the file import graph of the Project
 * at the branch asked for, each Package checked against its
 * monoverse.json as `vp lint` checks it. Everything that depends on what
 * is open or selected (the tree, the roll-up of connections) runs in the
 * browser on those facts, in the Actors' logic and the Monorepo service,
 * so a click never waits on the server.
 */

/**
 * The workspace and every file in it, for the repo view: its tree draws
 * each Package as one node with its Check, and a folder viewed lists the
 * files inside its Packages too.
 */
export function openProject(root: string, branch: string | null) {
  return Effect.gen(function* () {
    const snapshots = yield* Snapshots;
    const snapshot = yield* snapshots.open(root, branch);
    const files = yield* listFiles(snapshot, '');
    const workspace = yield* analyzeMonorepo(snapshot, files);
    const packages = yield* Effect.forEach(
      workspace.packages,
      (pkg) =>
        Effect.gen(function* () {
          const base = rootRelative(pkg.path);
          const inside = files.filter((path) => isWithin(path, base));
          const settings = yield* readSettingsOf(snapshot, inside, base);
          // Only a Package its monoverse.json checks has its imports read here.
          const imports =
            settings._tag === 'Read'
              ? yield* importsOf(snapshot, inside, base)
              : [];
          return { ...pkg, check: checkOf(settings, base, inside, imports) };
        }),
      { concurrency: 4 },
    );
    return { ...workspace, packages, files };
  });
}

/** One Package's files, Source roots, file import graph and Check, for its view. */
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
    const settings = yield* readSettingsOf(snapshot, files, base);
    const imports = yield* importsOf(snapshot, files, base);
    return {
      path: base,
      files,
      sourceRoots: sourceRootsOf(settings, base),
      imports,
      check: checkOf(settings, base, files, imports),
    };
  });
}

function readSettingsOf(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
  base: string,
) {
  return Effect.tryPromise({
    try: () => readSettings(snapshot, files, base),
    catch: (cause) =>
      new WorkspaceReadError({
        reason: 'files',
        path: base === '' ? '.' : base,
        message: `Could not read its monoverse.json: ${String(cause)}`,
      }),
  });
}

function importsOf(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
  base: string,
) {
  return buildFileGraph(snapshot, files).pipe(
    Effect.mapError(
      (error) =>
        new WorkspaceReadError({
          reason: 'imports',
          path: base === '' ? '.' : base,
          message: `Could not read the imports: ${String(error.cause)}`,
        }),
    ),
  );
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
