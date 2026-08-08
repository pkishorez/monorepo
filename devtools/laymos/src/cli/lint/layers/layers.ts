import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { analyzeProject } from '../../../orchestrator/analyze-project/index.js';
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
    const { layerAnalysis } = yield* analyzeProject(configPath);
    yield* Console.log(renderLayerReport(layerAnalysis));
    if (
      layerAnalysis.unassignedFiles.length > 0 ||
      layerAnalysis.forbiddenImports.length > 0 ||
      layerAnalysis.layersWithoutModules.length > 0
    ) {
      process.exitCode = 1;
    }
  });
}
