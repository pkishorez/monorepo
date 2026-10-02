import { Console, Effect } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';

import { inspectFile } from '../../../orchestrator/inspect/index.js';
import { resolveInspectionTarget } from '../path.js';
import { jsonFlag, renderJson } from '../json.js';
import { renderFileInspection } from './report.js';

const pathArgument = Argument.String('path').pipe(
  Argument.withDescription('Exact project-relative supported source file.'),
);

const recursiveFlag = Flag.Boolean('recursive').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Include dependencies reached transitively.'),
);

export function makeFileCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make(
    'file',
    { path: pathArgument, recursive: recursiveFlag, json: jsonFlag },
    ({ path, recursive, json }) =>
      Effect.gen(function* () {
        const configuredPath = yield* configPath;
        const target = resolveInspectionTarget(configuredPath, path);
        const inspection = yield* inspectFile(
          target.configPath,
          target.target,
          { recursive },
        );
        yield* Console.log(
          json ? renderJson(inspection) : renderFileInspection(inspection),
        );
      }),
  ).pipe(
    Command.withDescription(
      'Show a file’s architecture identity and dependencies.',
    ),
  );
}
