import { Console, Effect } from 'effect';
import { Argument, Command } from 'effect/unstable/cli';

import { inspectModule } from '../../../orchestrator/inspect/index.js';
import { resolveInspectionTarget } from '../path.js';
import { jsonFlag, renderJson } from '../json.js';
import { renderModuleInspection } from './report.js';

const pathArgument = Argument.string('path').pipe(
  Argument.withDescription('Exact configured Module path.'),
);

export function makeModuleCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make(
    'module',
    { path: pathArgument, json: jsonFlag },
    ({ path, json }) =>
      Effect.gen(function* () {
        const configuredPath = yield* configPath;
        const target = resolveInspectionTarget(configuredPath, path);
        const inspection = yield* inspectModule(
          target.configPath,
          target.target,
        );
        yield* Console.log(
          json ? renderJson(inspection) : renderModuleInspection(inspection),
        );
      }),
  ).pipe(
    Command.withDescription(
      'Show a Configured Module’s architecture identity and dependencies.',
    ),
  );
}
