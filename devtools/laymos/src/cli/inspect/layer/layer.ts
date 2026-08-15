import { Console, Effect } from 'effect';
import { Argument, Command } from 'effect/unstable/cli';

import { inspectLayer } from '../../../orchestrator/inspect/index.js';
import { jsonFlag, renderJson } from '../json.js';
import { renderLayerInspection } from './report.js';

const nameArgument = Argument.string('name').pipe(
  Argument.withDescription('Exact configured Layer name.'),
);

export function makeLayerCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make(
    'layer',
    { name: nameArgument, json: jsonFlag },
    ({ name, json }) =>
      Effect.gen(function* () {
        const configuredPath = yield* configPath;
        const inspection = yield* inspectLayer(configuredPath, name);
        yield* Console.log(
          json ? renderJson(inspection) : renderLayerInspection(inspection),
        );
      }),
  ).pipe(Command.withDescription('Show one Layer and its Modules.'));
}
