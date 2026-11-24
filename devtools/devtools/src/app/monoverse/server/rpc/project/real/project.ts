import {
  type PackageResult,
  configFile,
  joinPath,
  parseConfig,
} from '@kestack/monoverse';
import { Effect } from 'effect';

import { isWithin, rootRelative } from '../../contract/index.js';
import {
  Snapshots,
  type Snapshot,
} from '../../../services/snapshots/contract/index.js';
import {
  type Check,
  ProjectRpc,
  WorkspaceReadError,
} from '../contract/index.js';
import { type EngineJob, runEngine } from './engine.js';
import { fileGraph, graphSources } from './file-graph.js';
import { readText } from './read-text.js';
import { analyzeMonorepo } from './workspace/analyze-monorepo.js';

/*
 * Where the work happens: the server does what needs the disk, git and
 * OXC, and hands back the files and the file import graph of the Project
 * at the branch asked for, each Package checked against its
 * monoverse.json by @kestack/monoverse, the engine `monoverse lint` runs,
 * in a worker thread, on a folder on disk holding the branch: the
 * worktree that has it, or a copy of its commit. Everything that depends
 * on what is open or selected (the tree, the roll-up of connections) runs
 * in the browser on those facts, in the Actors' logic and the Projects
 * service, so a click never waits on the server.
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
    const files = yield* listFiles(snapshot);
    const workspace = yield* analyzeMonorepo(snapshot, files);
    // Only a Package with a monoverse.json is checked: without one, a
    // branch from git is never put on disk.
    const checked = workspace.packages
      .map(({ path }) => rootRelative(path))
      .filter((base) => files.includes(joinPath(base, configFile)));
    const { reports } = yield* engineOnDisk(snapshot, '.', {
      files,
      packages: checked,
      imports: [],
    });
    const checks = new Map(
      reports.map(({ path, result }) => [path, checkOf(result)]),
    );
    const unchecked: Check = { _tag: 'Unchecked' };
    const packages = workspace.packages.map((pkg) => ({
      ...pkg,
      check: checks.get(rootRelative(pkg.path)) ?? unchecked,
    }));
    return { ...workspace, packages, files };
  });
}

/** One Package's files, Source roots, file import graph and Check, for its view. */
export function readPackage(root: string, branch: string | null, path: string) {
  return Effect.gen(function* () {
    const snapshots = yield* Snapshots;
    const snapshot = yield* snapshots.open(root, branch);
    const base = rootRelative(path);
    // The whole Project, so the Package is checked as it is within it.
    const all = yield* listFiles(snapshot);
    const files = all.filter((file) => isWithin(file, base));
    if (!files.includes(joinPath(base, 'package.json'))) {
      return yield* new WorkspaceReadError({
        reason: 'package-not-found',
        path,
        message: 'No package.json in this folder.',
      });
    }
    const sourceRoots = yield* sourceRootsOf(snapshot, files, base);
    // The graph resolves its imports on disk as the check does, so the
    // engine runs for every Package that has a source file, checked or not.
    const answer = yield* engineOnDisk(snapshot, base, {
      files: all,
      packages: files.includes(joinPath(base, configFile)) ? [base] : [],
      imports: graphSources(files),
    });
    const [report] = answer.reports;
    const found = new Map(answer.imports);
    const imports = fileGraph(files, (file) => found.get(file) ?? []);
    const check: Check =
      report === undefined ? { _tag: 'Unchecked' } : checkOf(report.result);
    return { path: base, files, sourceRoots, imports, check };
  });
}

/**
 * The engine's answer to `job` on the snapshot's folder on disk; with
 * nothing to check and no imports to list, none, and nothing put on disk.
 */
function engineOnDisk(
  snapshot: Snapshot,
  base: string,
  job: Omit<EngineJob, 'root'>,
) {
  return Effect.gen(function* () {
    if (job.packages.length === 0 && job.imports.length === 0)
      return { reports: [], imports: [] };
    const root = yield* Effect.tryPromise({
      try: () => snapshot.onDisk(),
      catch: (cause) =>
        new WorkspaceReadError({
          reason: 'files',
          path: snapshot.root,
          message: `Could not put the branch on disk: ${String(cause)}`,
        }),
    });
    return yield* runEngine({ ...job, root }).pipe(
      Effect.mapError(
        (cause) =>
          new WorkspaceReadError({
            reason: 'imports',
            path: base === '' ? '.' : base,
            message: `Could not read the imports: ${String(cause)}`,
          }),
      ),
    );
  });
}

/** A Package's Check as the contract says it. */
function checkOf(result: PackageResult): Check {
  switch (result._tag) {
    case 'Unchecked':
      return { _tag: 'Unchecked' };
    case 'Invalid':
      return { _tag: 'Invalid', file: result.file, message: result.message };
    case 'Checked':
      return {
        _tag: 'Checked',
        violations: result.violations.map(
          ({ file, line, column, to, kind, message }) => ({
            from: file,
            line,
            column,
            ...(to === undefined ? {} : { to }),
            reason: kind,
            message,
          }),
        ),
      };
  }
}

/**
 * The Package's Source roots, relative to the root: its monoverse.json's,
 * or the whole Package without one that can be read.
 */
function sourceRootsOf(
  snapshot: Snapshot,
  files: ReadonlyArray<string>,
  base: string,
) {
  return Effect.tryPromise({
    try: async (): Promise<ReadonlyArray<string>> => {
      const path = joinPath(base, configFile);
      const text = files.includes(path)
        ? await readText(snapshot, path)
        : undefined;
      const read = text === undefined ? undefined : parseConfig(text);
      if (read === undefined || !read.ok) return [base];
      return read.config.sourceRoots.map((root) => joinPath(base, root));
    },
    catch: (cause) =>
      new WorkspaceReadError({
        reason: 'files',
        path: base === '' ? '.' : base,
        message: `Could not read its monoverse.json: ${String(cause)}`,
      }),
  });
}

function listFiles(snapshot: Snapshot) {
  return Effect.tryPromise({
    try: () => snapshot.list(''),
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
