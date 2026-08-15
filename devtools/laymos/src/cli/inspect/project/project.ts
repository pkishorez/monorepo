import { Console, Effect, Schema } from 'effect';
import { Command } from 'effect/unstable/cli';

import { ArchitectureAnalysisSchema } from '../../../architecture-analysis-schema/index.js';
import {
  inspectProject,
  type ProjectInspection,
} from '../../../orchestrator/inspect/index.js';
import { jsonFlag, renderJson } from '../json.js';
import { renderProjectInspection } from './report.js';

export function renderProjectJson(inspection: ProjectInspection): string {
  return renderJson(
    Schema.encodeSync(Schema.toCodecJson(ArchitectureAnalysisSchema))(
      inspection,
    ),
  );
}

export function makeProjectCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make('project', { json: jsonFlag }, ({ json }) =>
    Effect.gen(function* () {
      const configuredPath = yield* configPath;
      const inspection = yield* inspectProject(configuredPath);
      const output = json
        ? renderProjectJson(inspection)
        : renderProjectInspection(inspection);
      yield* Console.log(output);
    }),
  ).pipe(Command.withDescription('Show the whole Project architecture.'));
}
