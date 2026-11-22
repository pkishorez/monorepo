import { Context, Data, Effect, Layer } from 'effect';

import { MonoverseClient } from '../../client/index.js';
import type {
  Branches,
  ChangeSet,
  FileContent,
  FileDiff,
  PackageContents,
  ProjectEntry,
  Workspace,
} from '../../contract/index.js';
import {
  cycleLinks,
  rootRelative,
  shortenHome,
  violationsOf,
  type Link,
} from '../../model/index.js';

/*
 * What Monoverse's Actors ask of a project, in their own words: the
 * project list, a project analysed at a branch with its Package links and
 * cycles worked out, one Package read and checked, its branches, what a
 * branch changed, and one file or its diff. It sits on the server's typed
 * client, and turns every failure into one plain sentence.
 */

/** A project's folder as one branch has it; null reads the folder as it is on disk. */
export interface At {
  /** The project's folder, absolute. */
  readonly root: string;
  readonly branch: string | null;
}

/** A project analysed: what it is, and its Packages' links. */
export interface Analysis {
  readonly workspace: Workspace;
  /** Each Package's dependencies, as links between their folders. */
  readonly links: ReadonlyArray<Link>;
  /** The links that close each Package cycle. */
  readonly cycles: ReadonlyArray<Link>;
}

/** One Package read, and checked against the folder rule. */
export interface PackageReading {
  readonly contents: PackageContents;
  /** Every import of a file sitting directly in an ancestor folder. */
  readonly violations: ReadonlyArray<Link>;
}

/**
 * Why something could not be read, as one sentence. `missing`: the folder
 * is gone or holds no project; `not-git`: the project is not in a git
 * repository; `failed`: anything else.
 */
export class MonorepoProblem extends Data.TaggedError('MonorepoProblem')<{
  readonly message: string;
  readonly reason: 'missing' | 'not-git' | 'failed';
}> {}

export interface MonorepoService {
  /** The saved projects, newest first. */
  readonly projects: () => Effect.Effect<
    ReadonlyArray<ProjectEntry>,
    MonorepoProblem
  >;
  readonly analyse: (at: At) => Effect.Effect<Analysis, MonorepoProblem>;
  readonly readPackage: (
    at: At & { readonly path: string },
  ) => Effect.Effect<PackageReading, MonorepoProblem>;
  readonly branches: (at: {
    readonly root: string;
  }) => Effect.Effect<Branches, MonorepoProblem>;
  /** What `branch` changed since it left `base`. */
  readonly changes: (
    at: At & { readonly base: string },
  ) => Effect.Effect<ChangeSet, MonorepoProblem>;
  readonly readFile: (
    at: At & { readonly path: string },
  ) => Effect.Effect<FileContent, MonorepoProblem>;
  readonly fileDiff: (
    at: At & { readonly base: string; readonly path: string },
  ) => Effect.Effect<FileDiff, MonorepoProblem>;
}

export class Monorepo extends Context.Service<Monorepo, MonorepoService>()(
  '@kestack/devtools/monoverse/Monorepo',
) {}

/** Each Package's dependencies, as links between their folders. */
export function packageLinks(workspace: Workspace): ReadonlyArray<Link> {
  const pathOf = new Map(
    workspace.packages.map(({ name, path }) => [name, rootRelative(path)]),
  );
  return workspace.packages.flatMap((pkg) =>
    pkg.dependencies.flatMap(({ name }) => {
      const to = pathOf.get(name);
      return to === undefined ? [] : [[rootRelative(pkg.path), to] as const];
    }),
  );
}

/** The links that close each Package cycle. */
export function cycleLinksOf(workspace: Workspace): ReadonlyArray<Link> {
  const pathOf = new Map(
    workspace.packages.map(({ name, path }) => [name, rootRelative(path)]),
  );
  return cycleLinks(
    workspace.cycles.map(({ packages }) => packages),
    (name) => pathOf.get(name),
  );
}

/** Whatever the server or the wire failed with, as one sentence. */
export function problemOf(error: unknown): MonorepoProblem {
  const failed = (message: string) =>
    new MonorepoProblem({ message, reason: 'failed' });
  if (typeof error !== 'object' || error === null) return failed(String(error));
  if (!('_tag' in error))
    return failed(
      'message' in error && typeof error.message === 'string'
        ? error.message
        : String(error),
    );
  const e = error as { _tag: string } & Record<string, unknown>;
  const path = typeof e.path === 'string' ? shortenHome(e.path) : '';
  const message = typeof e.message === 'string' ? e.message : '';
  switch (e._tag) {
    case 'InvalidRootError':
      return new MonorepoProblem({
        reason: 'missing',
        message:
          e.reason === 'relative'
            ? `${path} is not an absolute path.`
            : e.reason === 'not-directory'
              ? `${path} is not a folder.`
              : `${path} does not exist.`,
      });
    case 'NoPackageJsonError':
      return new MonorepoProblem({
        reason: 'missing',
        message: `${path} has no package.json, so it is neither a monorepo nor a package.`,
      });
    case 'WorkspaceReadError':
      return failed(message === '' ? `Could not read ${path}.` : message);
    case 'FileNotFoundError':
      return failed(`${path} is not on this branch.`);
    case 'FileOutsideError':
      return failed(`${path} is outside the project.`);
    case 'FileReadError':
      return failed(`Could not read ${path}${message ? `: ${message}` : '.'}`);
    case 'GitUnavailableError':
      return e.reason === 'not-a-repo'
        ? new MonorepoProblem({
            reason: 'not-git',
            message: 'This project is not in a git repository.',
          })
        : failed(
            e.reason === 'unknown-ref'
              ? 'That branch is not in this repository.'
              : 'Git could not answer.',
          );
    case 'ProjectRegistryError':
      return failed(message === '' ? 'Could not read the projects.' : message);
    default:
      return failed(
        message === ''
          ? 'The DevTools server could not be reached.'
          : `The DevTools server could not be reached: ${message}`,
      );
  }
}

const plainly = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(Effect.mapError(problemOf));

/** The service, on the client the Layer is given. */
export const monorepoLayer = Layer.effect(
  Monorepo,
  Effect.gen(function* () {
    const client = yield* MonoverseClient;
    return Monorepo.of({
      projects: () => plainly(client.ListProjects()),
      analyse: ({ root, branch }) =>
        plainly(client.OpenProject({ root, branch })).pipe(
          Effect.map((workspace) => ({
            workspace,
            links: packageLinks(workspace),
            cycles: cycleLinksOf(workspace),
          })),
        ),
      readPackage: ({ root, branch, path }) =>
        plainly(client.ReadPackage({ root, branch, path })).pipe(
          Effect.map((contents) => ({
            contents,
            violations: violationsOf(contents.imports),
          })),
        ),
      branches: ({ root }) => plainly(client.GetBranches({ root })),
      changes: ({ root, branch, base }) =>
        plainly(client.GetChanges({ root, branch, base })),
      readFile: ({ root, branch, path }) =>
        plainly(client.ReadFile({ root, branch, path })),
      fileDiff: ({ root, branch, base, path }) =>
        plainly(client.GetFileDiff({ root, branch, base, path })),
    });
  }),
);
