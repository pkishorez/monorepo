import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { analyzeProject } from '../../../orchestrator/analyze-project/index.js';
import { renderModuleReport } from './report.js';

export function makeModulesCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make('modules', {}, () =>
    configPath.pipe(Effect.flatMap(runModulesLint)),
  ).pipe(
    Command.withDescription(
      'Check Module coverage, public boundaries, dependencies, and cycles.',
    ),
  );
}

export function runModulesLint(configPath: string) {
  return Effect.gen(function* () {
    const { moduleAnalysis } = yield* analyzeProject(configPath);
    yield* Console.log(renderModuleReport(moduleAnalysis));
    if (moduleAnalysis.violations.length > 0) process.exitCode = 1;
  });
}
