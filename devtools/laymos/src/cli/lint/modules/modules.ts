import { Console, Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { analyzeModules } from '../../../orchestrator/lint/modules/index.js';
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
    const result = yield* analyzeModules(configPath);
    yield* Console.log(renderModuleReport(result));
    if (result.violations.length > 0) process.exitCode = 1;
  });
}
