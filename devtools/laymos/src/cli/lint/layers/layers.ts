import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { lintLayers } from '../../../orchestrator/lint-layers.js';
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
    const result = yield* lintLayers(configPath);
    yield* Console.log(renderLayerReport(result));
    if (
      result.unassignedFiles.length > 0 ||
      result.forbiddenImports.length > 0
    ) {
      process.exitCode = 1;
    }
  });
}
