import { stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import { Console, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { deps } from '../../orchestrator/deps.js';
import { renderDependencyTree } from './dependency-tree.js';

const pathArgument = Argument.path('path', { mustExist: true }).pipe(
  Argument.withDescription('Project-relative file or folder to query.'),
);

const recursiveFlag = Flag.boolean('recursive').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Follow dependencies transitively, not just one hop.'),
);

const rootFlag = Flag.string('root').pipe(
  Flag.atLeast(0),
  Flag.withDescription(
    'Project-relative source root to scan. Repeatable. Defaults to "src".',
  ),
);

const ignoreFlag = Flag.string('ignore').pipe(
  Flag.withDefault(''),
  Flag.withDescription(
    'Comma-separated project-relative paths to exclude from the scan.',
  ),
);

export const depsCommand = Command.make(
  'deps',
  {
    path: pathArgument,
    recursive: recursiveFlag,
    root: rootFlag,
    ignore: ignoreFlag,
  },
  ({ path, recursive, root, ignore }) =>
    Effect.gen(function* () {
      const baseDir = process.cwd();
      const target = toPosixRelative(baseDir, path);
      const targetKind = yield* Effect.promise(() =>
        statTargetKind(baseDir, target),
      );
      const sourceRoots = root.length === 0 ? ['src'] : [...root];
      const ignoredPaths = ignore
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      const entries = yield* deps(baseDir, sourceRoots, target, targetKind, {
        recursive,
        ignoredPaths,
      });

      yield* Console.log(renderDependencyTree(target, entries));
    }),
).pipe(
  Command.withDescription(
    'Print the direct (and, with --recursive, transitive) dependencies of a file or folder.',
  ),
);

async function statTargetKind(
  baseDir: string,
  target: string,
): Promise<'file' | 'folder'> {
  const stats = await stat(resolve(baseDir, target));
  return stats.isDirectory() ? 'folder' : 'file';
}

function toPosixRelative(baseDir: string, path: string): string {
  const relativePath = relative(baseDir, resolve(baseDir, path));
  return sep === '/' ? relativePath : relativePath.split(sep).join('/');
}
