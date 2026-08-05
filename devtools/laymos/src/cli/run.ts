import { Console, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';

import { graph } from '../orchestrator/graph.js';

const sourceRootsArgument = Argument.string('source-root').pipe(
  Argument.withDescription(
    'Project-relative file or folder to scan. Defaults to "src".',
  ),
  Argument.variadic,
);

const ignoreFlag = Flag.string('ignore').pipe(
  Flag.withDefault(''),
  Flag.withDescription(
    'Comma-separated project-relative paths to exclude from the graph.',
  ),
);

const graphCommand = Command.make(
  'graph',
  { sourceRoots: sourceRootsArgument, ignore: ignoreFlag },
  ({ sourceRoots, ignore }) =>
    Effect.gen(function* () {
      const ignoredPaths = ignore
        .split(',')
        .map((path) => path.trim())
        .filter((path) => path.length > 0);
      const roots = Array.from(sourceRoots, String);
      const fileGraph = yield* graph(
        process.cwd(),
        roots.length === 0 ? ['src'] : roots,
        ignoredPaths,
      );
      yield* Console.log(
        JSON.stringify(Object.fromEntries(fileGraph), null, 2),
      );
    }),
).pipe(
  Command.withDescription('Print the internal file dependency graph as JSON.'),
);

const rootCommand = Command.make('laymos', {}, () => Effect.void).pipe(
  Command.withSubcommands([graphCommand]),
);

export const cli = rootCommand.pipe(Command.run({ version: '0.0.1' }));
