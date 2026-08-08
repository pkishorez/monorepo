import { dirname, relative, resolve, sep } from 'node:path';

import { Console, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { queryDependencies } from '../../orchestrator/query-dependencies/index.js';
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
        const entries = yield* queryDependencies(absoluteConfigPath, target, {
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

function toPosixRelative(baseDir: string, path: string): string {
  const relativePath = relative(baseDir, resolve(baseDir, path));
  return sep === '/' ? relativePath : relativePath.split(sep).join('/');
}
