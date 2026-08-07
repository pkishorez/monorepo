import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { analyzeLayers } from '../../../orchestrator/lint/layers/index.js';
import { renderLayerReport } from './report.js';

export function makeLayersCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make('layers', {}, () =>
    configPath.pipe(Effect.flatMap(runLayersLint)),
  ).pipe(
    Command.withDescription(
      'Check Layer coverage and cross-Layer dependency rules.',
    ),
  );
}

export function runLayersLint(configPath: string) {
  return Effect.gen(function* () {
    const result = yield* analyzeLayers(configPath);
    yield* Console.log(renderLayerReport(result));
    if (
      result.unassignedFiles.length > 0 ||
      result.forbiddenImports.length > 0
    ) {
      process.exitCode = 1;
    }
  });
}
