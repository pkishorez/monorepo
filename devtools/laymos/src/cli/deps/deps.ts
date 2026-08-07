import { stat } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import { Console, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { deps } from '../../orchestrator/deps/index.js';
import { renderDependencyTree } from './dependency-tree.js';

const pathArgument = Argument.path('path', { mustExist: true }).pipe(
  Argument.withDescription('Project-relative file or folder to query.'),
);

const recursiveFlag = Flag.boolean('recursive').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Follow dependencies transitively, not just one hop.'),
);

export function makeDepsCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make(
    'deps',
    {
      path: pathArgument,
      recursive: recursiveFlag,
    },
    ({ path, recursive }) =>
      Effect.gen(function* () {
        const configuredPath = yield* configPath;
        const absoluteConfigPath = resolve(configuredPath);
        const baseDir = dirname(absoluteConfigPath);
        const target = toPosixRelative(baseDir, path);
        const targetKind = yield* Effect.promise(() =>
          statTargetKind(baseDir, target),
        );
        const entries = yield* deps(absoluteConfigPath, target, targetKind, {
          recursive,
        });

        yield* Console.log(renderDependencyTree(target, entries));
      }),
  ).pipe(
    Command.withDescription(
      'Print the direct (and, with --recursive, transitive) dependencies of a file or folder.',
    ),
  );
}

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
