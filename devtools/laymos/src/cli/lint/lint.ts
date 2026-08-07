import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { lint } from '../../orchestrator/lint/index.js';
import { makeLayersCommand } from './layers/index.js';
import { renderLayerReport } from './layers/report.js';
import { makeModulesCommand } from './modules/index.js';
import { renderModuleReport } from './modules/report.js';

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
    const result = yield* lint(configPath);
    yield* Console.log(renderLayerReport(result.layers));
    yield* Console.log(renderModuleReport(result.modules));
    if (
      result.layers.unassignedFiles.length > 0 ||
      result.layers.forbiddenImports.length > 0 ||
      result.modules.violations.length > 0
    ) {
      process.exitCode = 1;
    }
  });
}
