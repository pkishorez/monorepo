import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';

import { makeLayersCommand, runLayersLint } from './layers/index.js';

export function makeLintCommand<R>(
  configPath: Effect.Effect<string, never, R>,
) {
  return Command.make('lint', {}, () =>
    configPath.pipe(Effect.flatMap(runLayersLint)),
  ).pipe(
    Command.withDescription('Check every configured architectural rule.'),
    Command.withSubcommands([makeLayersCommand(configPath)]),
  );
}
