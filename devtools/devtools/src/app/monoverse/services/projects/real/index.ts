import { Effect, Layer } from 'effect';

import {
  rootRelative,
  shortenHome,
} from '../../../server/rpc/contract/index.js';
import type { Workspace } from '../../../server/rpc/project/contract/index.js';
import {
  Projects,
  ProjectsProblem,
  type Link,
  type ProjectsService,
} from '../contract/index.js';
import { makeClient, protocolAt, type Client } from './client.js';
import { cycleLinks } from './package-cycles.js';

/*
 * The Projects service on the server's typed client: the analysis gets its
 * Package links and cycles worked out, and every failure becomes one plain
 * sentence. A Package's Violations come checked from the server.
 */

/** Each Package's dependencies, as links between their folders. */
function packageLinks(workspace: Workspace): ReadonlyArray<Link> {
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
function cycleLinksOf(workspace: Workspace): ReadonlyArray<Link> {
  const pathOf = new Map(
    workspace.packages.map(({ name, path }) => [name, rootRelative(path)]),
  );
  return cycleLinks(
    workspace.cycles.map(({ packages }) => packages),
    (name) => pathOf.get(name),
  );
}

/** Whatever the server or the wire failed with, as one sentence. */
export function problemOf(error: unknown): ProjectsProblem {
  const failed = (message: string) =>
    new ProjectsProblem({ message, reason: 'failed' });
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
      return new ProjectsProblem({
        reason: 'missing',
        message:
          e.reason === 'relative'
            ? `${path} is not an absolute path.`
            : e.reason === 'not-directory'
              ? `${path} is not a folder.`
              : `${path} does not exist.`,
      });
    case 'NoPackageJsonError':
      return new ProjectsProblem({
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
        ? new ProjectsProblem({
            reason: 'not-git',
            message: 'This project is not in a git repository.',
          })
        : failed(
            e.reason === 'unknown-ref'
              ? 'That branch is not in this repository.'
              : 'Git could not answer.',
          );
    case 'FolderError':
      return failed(message === '' ? `Could not read ${path}.` : message);
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

/** The service, on a client. */
export const projectsOn = (client: Client): ProjectsService =>
  Projects.of({
    projects: () => plainly(client.ListProjects()),
    addProject: ({ path }) => plainly(client.AddProject({ path })),
    removeProject: ({ id }) => plainly(client.RemoveProject({ id })),
    listFolders: ({ path, query, hidden }) =>
      plainly(client.ListFolders({ path, query, hidden })),
    analyse: ({ root, branch }) =>
      plainly(client.OpenProject({ root, branch })).pipe(
        Effect.map((workspace) => ({
          workspace,
          links: packageLinks(workspace),
          cycles: cycleLinksOf(workspace),
        })),
      ),
    readPackage: ({ root, branch, path }) =>
      plainly(client.ReadPackage({ root, branch, path })),
    branches: ({ root }) => plainly(client.GetBranches({ root })),
    changes: ({ root, branch, base }) =>
      plainly(client.GetChanges({ root, branch, base })),
    readFile: ({ root, branch, path }) =>
      plainly(client.ReadFile({ root, branch, path })),
    fileDiff: ({ root, branch, base, path }) =>
      plainly(client.GetFileDiff({ root, branch, base, path })),
  });

/** The service, on the client of the DevTools Server at `origin`. */
export const projectsLayer = (origin: string) =>
  Layer.effect(Projects, Effect.map(makeClient, projectsOn)).pipe(
    Layer.provide(protocolAt(origin)),
  );
