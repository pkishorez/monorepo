import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { analyzeProject } from '../../orchestrator/analyze-project/index.js';
import { getStoryTree } from '../../orchestrator/run-stories/index.js';
import { makeLayersCommand } from './layers/index.js';
import { renderLayerReport } from './layers/report.js';
import { makeModulesCommand } from './modules/index.js';
import { renderModuleReport } from './modules/report.js';
import {
  countGroupsWithoutPage,
  renderStoriesReport,
} from './stories/index.js';

export function makeLintCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make('lint', {}, () =>
    configPath.pipe(Effect.flatMap(runLint)),
  ).pipe(
    Command.withDescription('Check every configured architectural rule.'),
    Command.withSubcommands([
      makeLayersCommand(configPath),
      makeModulesCommand(configPath),
    ]),
  );
}

function runLint(configPath: string) {
  return Effect.gen(function* () {
    const result = yield* analyzeProject(configPath);
    yield* Console.log(renderLayerReport(result.layerAnalysis));
    yield* Console.log(renderModuleReport(result.moduleAnalysis));
    const missingPages = yield* lintStories(configPath);
    if (
      result.layerAnalysis.unassignedFiles.length > 0 ||
      result.layerAnalysis.forbiddenImports.length > 0 ||
      result.layerAnalysis.layersWithoutModules.length > 0 ||
      result.moduleAnalysis.violations.length > 0 ||
      missingPages > 0
    ) {
      process.exitCode = 1;
    }
  });
}

// A project without a Stories path has no Story Groups to lint.
function lintStories(configPath: string) {
  return getStoryTree(configPath).pipe(
    Effect.flatMap((tree) =>
      Console.log(renderStoriesReport(tree)).pipe(
        Effect.as(countGroupsWithoutPage(tree)),
      ),
    ),
    Effect.catchTag('StoriesError', (error) =>
      error.reason === 'no-stories-path'
        ? Effect.succeed(0)
        : Effect.die(error),
    ),
  );
}
